import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataDensity } from './data-density';

describe('DataDensity', () => {
  let component: DataDensity;
  let fixture: ComponentFixture<DataDensity>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataDensity],
    }).compileComponents();

    fixture = TestBed.createComponent(DataDensity);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
