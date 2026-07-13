import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DuckDbService } from '../../services/duckdb/duck-db';
import { ChartComponent } from 'ng-apexcharts';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';

@Component({
  selector: 'app-day-view',
  imports: [ChartComponent, MatFormFieldModule, MatInputModule, MatDatepickerModule],
  templateUrl: './day-view.html',
  styleUrl: './day-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayView implements OnInit {
  private readonly duckDb = inject(DuckDbService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly selectedDate = signal<Date>(new Date('2025-09-28'));
  protected readonly data = signal<any[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<any | undefined>(undefined);

  protected chartOptions: any = {
    series: [],
    chart: {
      type: 'line',
      height: 350,
      zoom: { enabled: true },
    },
    xaxis: {
      type: 'datetime',
      title: { text: 'Time of Day' },
    },
    yaxis: {
      title: { text: 'PM2.5 (µg/m³)' },
    },
    title: {
      text: 'Air Quality Data',
    },
  };

  ngOnInit(): void {
    this.loadParquetData();
  }

  protected onDateChange(newDate: any): void {
    if (newDate) {
      const nativeDate = new Date(newDate);
      this.selectedDate.set(nativeDate);
      this.loadParquetData();
    }
  }

  private async loadParquetData(): Promise<void> {
    this.loading.set(true);
    try {
      const formattedDate = this.selectedDate().toISOString().split('T')[0];

      const sql = `
        SELECT
          timestamp,
          pm25,
          status,
          units,
          station
        FROM DATA_FILE
        WHERE CAST(timestamp AS DATE) = '${formattedDate}'
        ORDER BY timestamp ASC
      `;

      this.data.set(await this.duckDb.queryParquet(sql));
      this.setChartSeries();
    } catch (err) {
      console.error(err);
      this.error.set(err);
    } finally {
      this.loading.set(false);

      this.cdr.detectChanges();
    }
  }

  protected objectKeys(object: any): string[] {
    return object ? Object.keys(object) : [];
  }

  protected objectValues(object: any): any[] {
    return object ? Object.values(object) : [];
  }

  private setChartSeries() {
    const chartDataPoints = this.data().map((row) => [
      row.timestamp, // x-axis (milliseconds)
      row.pm25, // y-axis (value)
    ]);

    this.chartOptions.series = [
      {
        name: 'PM2.5 Level',
        data: chartDataPoints,
      },
    ];
  }
}
