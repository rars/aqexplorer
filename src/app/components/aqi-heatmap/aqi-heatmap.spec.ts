import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AqiHeatmap } from './aqi-heatmap';

describe('AqiHeatmap', () => {
  let component: AqiHeatmap;
  let fixture: ComponentFixture<AqiHeatmap>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AqiHeatmap],
    }).compileComponents();

    fixture = TestBed.createComponent(AqiHeatmap);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
