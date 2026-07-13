import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DuckDbService } from '../../services/duckdb/duck-db';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexTitleSubtitle,
  ApexXAxis,
  ApexYAxis,
  ChartComponent,
} from 'ng-apexcharts';
import { format } from 'date-fns';

@Component({
  selector: 'app-day-view',
  imports: [ChartComponent],
  templateUrl: './day-view.html',
  styleUrl: './day-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayView {
  private readonly duckDb = inject(DuckDbService);
  private readonly cdr = inject(ChangeDetectorRef);

  public readonly date = input.required<Date>();
  protected readonly data = signal<any[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<any | undefined>(undefined);

  protected readonly chart: ApexChart = {
    type: 'line',
    height: 350,
    zoom: { enabled: false },
  };
  protected readonly xaxis: ApexXAxis = {
    type: 'datetime',
    title: { text: 'Time of Day' },
  };
  protected readonly title: ApexTitleSubtitle = {
    text: 'PM2.5 (µg/m³)',
  };

  protected readonly series = computed<ApexAxisChartSeries>(() => {
    const rawRows = this.data();

    const chartDataPoints = rawRows.map((row) => [new Date(row.timestamp).getTime(), row.pm25]);

    return [
      {
        name: 'PM2.5 Level',
        data: chartDataPoints,
      },
    ];
  });

  protected readonly yaxis = computed(() => {
    const _ = this.series();

    const axisConfig: ApexYAxis = {
      title: { text: 'PM2.5 (µg/m³)' },
      forceNiceScale: true,
    };
    return axisConfig;
  });

  public constructor() {
    effect(() => {
      const selectedDate = this.date();
      this.loadParquetData(selectedDate);
    });
  }

  private async loadParquetData(date: Date): Promise<void> {
    this.loading.set(true);
    try {
      const formattedDate = format(date, 'yyyy-MM-dd');

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
}
