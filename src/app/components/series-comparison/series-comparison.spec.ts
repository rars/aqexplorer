import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SeriesComparison } from './series-comparison';

describe('SeriesComparison', () => {
  let component: SeriesComparison;
  let fixture: ComponentFixture<SeriesComparison>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SeriesComparison],
    }).compileComponents();

    fixture = TestBed.createComponent(SeriesComparison);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
