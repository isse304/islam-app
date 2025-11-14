import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Get Firestore instance for the "nura" database
const getNuraDb = () => {
  // Use the new modular API to specify the database
  return getFirestore(admin.app(), "nura");
};

export const onAssignmentCreated = functions
  .firestore.database("nura")
  .document("assignments/{aid}")
  .onCreate(async (snap: functions.firestore.QueryDocumentSnapshot) => {
    try {
      const assignment = snap.data();
      
      // Get the Firestore instance
      const db = getNuraDb();
      
      // Handle classroom assignments
      if (assignment.mode === 'classroom' && assignment.classId) {
        const classRef = db.collection("classes").doc(assignment.classId);
        const classDoc = await classRef.get();
        
        if (!classDoc.exists) {
          console.log("Class not found:", assignment.classId);
          return;
        }
        
        const classData = classDoc.data();
        if (!classData || !classData.memberIds) {
          console.log("No members in class:", assignment.classId);
          return;
        }

        const notifications = classData.memberIds.map((memberId: string) => ({
          toUid: memberId,
          type: 'assignment_posted',
          ref: { collection: 'assignments', id: snap.id },
          title: 'New Assignment Posted',
          body: `A new assignment, "${assignment.title}", has been posted for your class.`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }));

        const batch = db.batch();
        notifications.forEach((notification: any) => {
          const notificationRef = db.collection("notifications").doc();
          batch.set(notificationRef, notification);
        });

        await batch.commit();
        console.log(`Created ${notifications.length} notifications for classroom assignment`);
      }
      
      // Handle individual assignments
      else if (assignment.mode === 'individual' && assignment.studentId) {
        const notification = {
          toUid: assignment.studentId,
          type: 'assignment_posted',
          ref: { collection: 'assignments', id: snap.id },
          title: 'New Assignment Posted',
          body: `Your teacher has posted a new assignment: "${assignment.title}"`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        
        await db.collection("notifications").add(notification);
        console.log(`Created notification for individual assignment to student: ${assignment.studentId}`);
      }
    } catch (error) {
      console.error("Error in onAssignmentCreated:", error);
      // Don't throw - we don't want to fail the assignment creation
    }
  });

export const onSubmissionGraded = functions
  .firestore.database("nura")
  .document("submissions/{sid}")
  .onUpdate(async (change: functions.Change<functions.firestore.QueryDocumentSnapshot>) => {
    try {
      const before = change.before.data();
      const after = change.after.data();

      if (!before?.gradedAt && after?.gradedAt) {
        // Get the Firestore instance
        const db = getNuraDb();
        
        const notification = {
          toUid: after.studentId,
          type: 'graded',
          ref: { collection: 'submissions', id: change.after.id },
          title: 'Assignment Graded',
          body: 'Your recent submission has been graded by your teacher.',
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection("notifications").add(notification);
        console.log(`Created graded notification for student: ${after.studentId}`);
      }
    } catch (error) {
      console.error("Error in onSubmissionGraded:", error);
    }
  });

export const onSubmissionCreated = functions
  .firestore.database("nura")
  .document("submissions/{sid}")
  .onCreate(async (snap: functions.firestore.QueryDocumentSnapshot) => {
    const submission = snap.data();
    
    // Only notify if status is 'submitted' (not drafts)
    if (submission.status !== 'submitted') {
      return;
    }

    try {
      // Get the Firestore instance
      const db = getNuraDb();
      
      // Get assignment details
      const assignmentDoc = await db.collection("assignments").doc(submission.assignmentId).get();
      if (!assignmentDoc.exists) {
        console.error("Assignment not found:", submission.assignmentId);
        return;
      }
      const assignment = assignmentDoc.data();
      if (!assignment) return;

      // Get student details
      const studentDoc = await db.collection("users").doc(submission.studentId).get();
      const student = studentDoc.exists ? studentDoc.data() : null;
      const studentName = student?.displayName || student?.email || "A student";

      // Create notification for teacher
      const notification = {
        toUid: assignment.teacherId,
        type: "submission_received",
        ref: {collection: "submissions", id: snap.id},
        title: "📝 New Submission Received",
        body: `${studentName} submitted "${assignment.title}"`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          assignmentId: submission.assignmentId,
          studentId: submission.studentId,
          classId: assignment.classId,
          studentName: studentName,
        },
      };

      await db.collection("notifications").add(notification);
      console.log("Submission notification created for teacher:", assignment.teacherId);
    } catch (error) {
      console.error("Error creating submission notification:", error);
    }
  });
