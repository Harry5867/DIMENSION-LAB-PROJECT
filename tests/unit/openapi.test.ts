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
