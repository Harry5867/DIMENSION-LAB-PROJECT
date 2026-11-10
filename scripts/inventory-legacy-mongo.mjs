import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.LEGACY_MONGODB_URI;
if (!uri) {
  console.error('Set LEGACY_MONGODB_URI to an explicitly approved read-only connection.');
  process.exit(1);
}

try {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, timeoutMS: 12000 });
  try {
    const db = client.db('cancer_explorer');
    const inventory = {};
    for (const name of ['datasets', 'experiments']) {
      const collection = db.collection(name);
      const filter = name === 'datasets' ? { id: { $nin: ['cancer_wdbc', 'wholesale_customers'] } } : {};
      const total = await collection.countDocuments(filter);
      const ownerIdCandidates = await collection.countDocuments({ ...filter, ownerId: { $type: 'objectId' } });
      inventory[name] = { total, ownerIdCandidates, withoutObjectIdOwner: total - ownerIdCandidates };
    }
    console.log(JSON.stringify(inventory, null, 2));
  } finally {
    await client.close();
  }
} catch {
  console.error('Legacy inventory failed. Check the read-only connection and database access.');
  process.exitCode = 1;
}
