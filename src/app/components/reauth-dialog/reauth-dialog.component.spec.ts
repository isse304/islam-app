import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReauthDialogComponent } from './reauth-dialog.component';

describe('ReauthDialogComponent', () => {
  let component: ReauthDialogComponent;
  let fixture: ComponentFixture<ReauthDialogComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ReauthDialogComponent]
    });
    fixture = TestBed.createComponent(ReauthDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
