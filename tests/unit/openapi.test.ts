import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../../backend/src/app';
import { openApiSpec } from '../../backend/src/docs/openapi';

type ExpressRoute = {
  path: string | string[];
  methods: Record<string, boolean>;
};

function registeredRoutes() {
  const router = (createApp() as unknown as {
    _router: { stack: Array<{ route?: ExpressRoute }> };
  })._router;

  return router.stack.flatMap(({ route }) => {
    if (!route) return [];
    const paths = Array.isArray(route.path) ? route.path : [route.path];
    return paths.flatMap(path => Object.keys(route.methods)
      .filter(method => route.methods[method])
      .map(method => `${method.toUpperCase()} ${path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`));
  });
}

test('OpenAPI documents every Express route and HTTP method', () => {
  const documented = new Set<string>();
  for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (operation && typeof operation === 'object' && 'responses' in operation) {
        documented.add(`${method.toUpperCase()} ${path}`);
      }
    }
  }

  const missing = registeredRoutes().filter(route => !documented.has(route));
  assert.deepEqual(missing, [], `Undocumented Express routes:\n${missing.join('\n')}`);
});

test('every OpenAPI operation defines response schemas and typed request bodies', () => {
  const incomplete: string[] = [];

  for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;
      const label = `${method.toUpperCase()} ${path}`;
      const responses = operation.responses as Record<string, { content?: Record<string, { schema?: unknown }> }>;
      const successResponses = Object.entries(responses).filter(([status]) => /^[23]\d\d$/.test(status));
      if (!successResponses.length) incomplete.push(`${label}: missing successful response`);
      for (const [status, response] of successResponses) {
        for (const [mediaType, definition] of Object.entries(response.content ?? {})) {
          if (!definition.schema) incomplete.push(`${label} ${status} ${mediaType}: missing response schema`);
        }
      }
      const definition = operation as {
        requestBody?: { content?: Record<string, { schema?: unknown }> };
        parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
      };
      if (definition.requestBody && !Object.values(definition.requestBody.content ?? {}).some(mediaType => mediaType.schema)) {
        incomplete.push(`${label}: missing request schema`);
      }
      for (const name of path.matchAll(/\{([^}]+)\}/g)) {
        if (!definition.parameters?.some(parameter => parameter.in === 'path' && parameter.name === name[1] && parameter.required)) {
          incomplete.push(`${label}: missing required path parameter ${name[1]}`);
        }
      }
    }
  }

  const componentNames = new Set(Object.keys(openApiSpec.components.schemas));
  const inspectRefs = (value: unknown, location: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => inspectRefs(item, `${location}[${index}]`));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (key === '$ref' && typeof item === 'string') {
          const schemaName = /^#\/components\/schemas\/([^/]+)$/.exec(item)?.[1];
          if (!schemaName || !componentNames.has(schemaName)) incomplete.push(`${location}: unresolved schema ref ${item}`);
        } else {
          inspectRefs(item, `${location}.${key}`);
        }
      }
    }
  };
  inspectRefs(openApiSpec.paths, 'paths');
  inspectRefs(openApiSpec.components, 'components');

  assert.deepEqual(incomplete, [], `Incomplete OpenAPI operations:\n${incomplete.join('\n')}`);
});

test('OpenAPI states pagination limits, ordering, unsupported filters, and count semantics', () => {
  const operationAt = (path: string, method: string) => {
    const operation = (openApiSpec.paths as Record<string, Record<string, unknown>>)[path]?.[method];
    assert.ok(operation && typeof operation === 'object', `Missing ${method.toUpperCase()} ${path}`);
    return operation as {
      description?: string;
      parameters?: Array<{ name?: string; in?: string; description?: string; schema?: Record<string, unknown> }>;
      responses?: Record<string, { headers?: Record<string, { description?: string; schema?: Record<string, unknown> }> }>;
    };
  };
  const datasetList = operationAt('/api/v1/datasets', 'get');
  const userList = operationAt('/api/v1/users', 'get');
  const pointsList = operationAt('/api/v2/analyses/{id}/points', 'get');
  const parameter = (operation: ReturnType<typeof operationAt>, name: string) =>
    operation.parameters?.find(item => item.in === 'query' && item.name === name);

  assert.equal(parameter(datasetList, 'limit')?.schema?.default, 50);
  assert.equal(parameter(datasetList, 'limit')?.schema?.maximum, 100);
  assert.equal(parameter(userList, 'offset')?.schema?.maximum, 100_000);
  assert.equal(parameter(pointsList, 'limit')?.schema?.default, 100);
  assert.equal(parameter(pointsList, 'limit')?.schema?.maximum, 500);
  assert.match(datasetList.description ?? '', /Sort\/filter are not implemented/);
  assert.match(userList.description ?? '', /ordered by createdAt descending/);
  assert.match(pointsList.description ?? '', /after includeExcluded filtering and before pagination/i);
  assert.match(pointsList.description ?? '', /not a snapshot/i);
  assert.match(pointsList.responses?.['200']?.headers?.['X-Total-Count']?.description ?? '', /before applying offset and limit/);
  assert.deepEqual(pointsList.responses?.['200']?.headers?.['X-Next-Offset']?.schema?.example, 100);
});

test('OpenAPI keeps route-specific request and response schemas isolated', () => {
  const operationAt = (path: string, method: string) => {
    const operation = (openApiSpec.paths as Record<string, Record<string, unknown>>)[path]?.[method];
    assert.ok(operation && typeof operation === 'object', `Missing ${method.toUpperCase()} ${path}`);
    return operation as {
      requestBody?: { required?: boolean; content?: Record<string, { schema?: { $ref?: string } }> };
      responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
      parameters?: Array<{ name?: string; in?: string }>;
    };
  };
  const requestRef = (path: string, method: string) =>
    operationAt(path, method).requestBody?.content?.['application/json']?.schema?.$ref;

  assert.equal(requestRef('/api/v1/auth/register', 'post'), '#/components/schemas/RegistrationRequest');
  assert.equal(requestRef('/api/v1/auth/login', 'post'), '#/components/schemas/AuthCredentials');
  assert.equal(requestRef('/api/v1/analyses', 'post'), '#/components/schemas/AnalysisRequest');
  assert.equal(requestRef('/api/v2/analyses/{id}/points/filter', 'post'), '#/components/schemas/PointFilterRequest');
  assert.equal(operationAt('/api/v1/analyses/{id}/reports', 'post').requestBody?.required, false);
  assert.equal(operationAt('/api/v1/auth/login', 'post').requestBody?.required, true);

  const responseSchema = operationAt('/api/v2/analyses/{id}/points', 'get').responses?.['200']?.content?.['application/json']?.schema;
  assert.deepEqual(responseSchema, {
    allOf: [
      { $ref: '#/components/schemas/ApiSuccess' },
      { type: 'object', properties: { data: { $ref: '#/components/schemas/PointList' } } },
    ],
  });
  assert.equal(
    operationAt('/openapi.json', 'get').responses?.['200']?.content?.['application/json']?.schema
      && (operationAt('/openapi.json', 'get').responses?.['200']?.content?.['application/json']?.schema as { $ref?: string }).$ref,
    '#/components/schemas/OpenApiDocument',
  );
  const v1PointParams = operationAt('/api/v1/datasets', 'get').parameters?.filter(parameter => parameter.in === 'query');
  const v2PointParams = operationAt('/api/v2/datasets', 'get').parameters?.filter(parameter => parameter.in === 'query');
  assert.equal(v1PointParams?.length, 2);
  assert.equal(v2PointParams?.length, 2);
});
