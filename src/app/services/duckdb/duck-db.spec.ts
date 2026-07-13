import { TestBed } from '@angular/core/testing';

import { DuckDb } from './duck-db';

describe('DuckDb', () => {
  let service: DuckDb;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DuckDb);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
