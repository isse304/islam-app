import { inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot, CanActivateFn, UrlTree } from '@angular/router';
import { Observable, of, from } from 'rxjs';
import { map, switchMap, catchError, take } from 'rxjs/operators';
import { Firestore, doc, getDoc, collection, query, where, getDocs } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { MatDialog } from '@angular/material/dialog';
import { Assignment, Class } from '../models/classroom.models';
import { genericConverter } from '../models/firestore-converters';
import { AssignmentAccessDeniedDialogComponent } from '../components/dialogs/assignment-access-denied-dialog/assignment-access-denied-dialog.component';

/**
 * Guard to protect assignment mode in the reader
 * Ensures only authorized users can access assignments
 */
export const assignmentGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<boolean | UrlTree> => {
  const firestore = inject(Firestore);
  const auth = inject(Auth);
  const router = inject(Router);
  const dialog = inject(MatDialog);

  // Check if this is assignment mode
  const mode = route.queryParamMap.get('mode');
  if (mode !== 'assignment') {
    // Not assignment mode, allow access
    return of(true);
  }

  // Get assignment ID
  const assignmentId = route.queryParamMap.get('aid');
  if (!assignmentId) {
    // No assignment ID, deny access
    console.error('Assignment mode requires an assignment ID');
    return of(router.createUrlTree(['/home']));
  }

  // Get current user
  const user = auth.currentUser;
  if (!user) {
    // Not authenticated, redirect to login
    return of(router.createUrlTree(['/auth/login']));
  }

  // Fetch assignment and verify access
  const assignmentRef = doc(firestore, `assignments/${assignmentId}`).withConverter(
    genericConverter<Assignment>()
  );

  return from(getDoc(assignmentRef)).pipe(
    take(1),
    switchMap(async (assignmentSnap) => {
      if (!assignmentSnap.exists()) {
        console.error('Assignment not found:', assignmentId);
        showAccessDeniedDialog(dialog, 'Assignment not found', router);
        return router.createUrlTree(['/home']);
      }

      const assignment = assignmentSnap.data();

      // Check if user is the teacher (teachers can always view their assignments)
      if (assignment.teacherId === user.uid) {
        return true;
      }

      // Check based on assignment mode
      if (assignment.mode === 'individual') {
        // Individual assignment: check if assigned to this student
        if (assignment.studentId === user.uid) {
          return true;
        } else {
          showAccessDeniedDialog(
            dialog,
            'This assignment is not assigned to you.',
            router
          );
          return router.createUrlTree(['/s/assignments']);
        }
      } else if (assignment.mode === 'classroom') {
        // Classroom assignment: check if user is in the class
        if (!assignment.classId) {
          console.error('Classroom assignment missing classId');
          showAccessDeniedDialog(dialog, 'Invalid assignment configuration', router);
          return router.createUrlTree(['/home']);
        }

        const classRef = doc(firestore, `classes/${assignment.classId}`).withConverter(
          genericConverter<Class>()
        );
        const classSnap = await getDoc(classRef);

        if (!classSnap.exists()) {
          console.error('Class not found:', assignment.classId);
          showAccessDeniedDialog(dialog, 'Class not found', router);
          return router.createUrlTree(['/home']);
        }

        const classData = classSnap.data();

        // Check if user is a member of the class
        if (classData.memberIds?.includes(user.uid)) {
          return true;
        } else {
          showAccessDeniedDialog(
            dialog,
            `You don't have access to this assignment. Join the class "${classData.name}" to view it.`,
            router,
            classData.code
          );
          return router.createUrlTree(['/s/assignments']);
        }
      } else {
        console.error('Unknown assignment mode:', assignment.mode);
        showAccessDeniedDialog(dialog, 'Invalid assignment type', router);
        return router.createUrlTree(['/home']);
      }
    }),
    catchError((error) => {
      console.error('Error checking assignment access:', error);
      showAccessDeniedDialog(dialog, 'Error verifying access. Please try again.', router);
      return of(router.createUrlTree(['/home']));
    })
  );
};

/**
 * Show access denied dialog
 */
function showAccessDeniedDialog(
  dialog: MatDialog,
  message: string,
  router: Router,
  classCode?: string
): void {
  // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
  setTimeout(() => {
    dialog.open(AssignmentAccessDeniedDialogComponent, {
      width: '400px',
      data: { message, classCode },
      disableClose: false,
    });
  }, 0);
}

