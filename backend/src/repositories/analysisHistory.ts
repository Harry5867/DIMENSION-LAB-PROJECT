import { ObjectId } from 'mongodb';
import { atlasDatabase } from '../database/atlas';

// JSON strings preserve user-defined CSV column names verbatim in BSON.
const history = () => atlasDatabase().collection<{ _id: ObjectId; runs: string[] }>('unsupervised_history');

export async function loadHistory(ownerId: string) {
  const record = await history().findOne({ _id: new ObjectId(ownerId) });
  return record?.runs ?? [];
}

export async function prependHistory(ownerId: string, run: string, limit: number) {
  const record = await history().findOneAndUpdate({ _id: new ObjectId(ownerId) },
    { $push: { runs: { $each: [run], $position: 0, $slice: limit } } },
    { upsert: true, returnDocument: 'after' });
  if (!record) throw new Error('Analysis history write did not return a record.');
  return record.runs;
}
