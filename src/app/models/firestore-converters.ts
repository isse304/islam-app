import {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  DocumentData,
} from '@angular/fire/firestore';

export const genericConverter = <T>(): FirestoreDataConverter<T> => ({
  toFirestore: (data: T): DocumentData => {
    const { id, ...rest } = data as any;
    return rest;
  },
  fromFirestore: (
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): T => {
    const data = snapshot.data(options)!;
    return {
      id: snapshot.id,
      ...data,
    } as T;
  },
});
