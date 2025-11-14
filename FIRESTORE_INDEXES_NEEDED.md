# Firestore Composite Indexes Needed

## Overview
Some Firestore queries require composite indexes. If you see errors like "WebChannelConnection RPC 'Listen' stream errored" or "Missing index" errors, you need to create these indexes.

## Required Indexes

### 1. Assignments Collection - Classroom Mode Query
**Collection:** `assignments`
**Fields:**
- `mode` (Ascending)
- `classId` (Ascending)

**Why:** Used when teacher views assignments for a classroom

### 2. Assignments Collection - Individual Mode Query  
**Collection:** `assignments`
**Fields:**
- `mode` (Ascending)
- `studentId` (Ascending)

**Why:** Used when teacher views assignments for an individual student

## How to Create Indexes

### Option 1: Automatic (Recommended)
1. Run the app and trigger the query (e.g., view a class or student)
2. Check the browser console for an error message
3. The error will contain a **direct link** to create the index
4. Click the link and Firebase will auto-generate the index
5. Wait 1-2 minutes for the index to build

### Option 2: Manual via Firebase Console
1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. Navigate to **Firestore Database** > **Indexes** tab
4. Click **Create Index**
5. Fill in:
   - Collection ID: `assignments`
   - Add the fields listed above
   - Query scope: Collection
6. Click **Create Index**

### Option 3: Using firebase.indexes.json
Add this to your `firebase.indexes.json` file:

```json
{
  "indexes": [
    {
      "collectionGroup": "assignments",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "mode",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "classId",
          "order": "ASCENDING"
        }
      ]
    },
    {
      "collectionGroup": "assignments",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "mode",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "studentId",
          "order": "ASCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Then deploy with:
```bash
firebase deploy --only firestore:indexes
```

## Error Prevention
The app now handles missing indexes gracefully:
- Returns empty arrays instead of crashing
- Logs errors to console for debugging
- Shows user-friendly error messages

## Note
If you continue to see errors after creating indexes:
1. Wait a few minutes for indexes to finish building
2. Check index status in Firebase Console
3. Clear browser cache and refresh
4. Check console for specific error messages



