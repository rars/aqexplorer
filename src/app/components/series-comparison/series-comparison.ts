import {
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { addDays, endOfYear, format, set, startOfDay, startOfYear } from 'date-fns';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexStroke,
  ApexTitleSubtitle,
  ApexXAxis,
  ApexYAxis,
  ChartComponent,
} from 'ng-apexcharts';
import { DuckDbService } from '../../services/duckdb/duck-db';

interface DataPoint {
  time: number;
  pm25: number;
  dayStr: string;
  dateLabel: string;
}

@Component({
  selector: 'app-series-comparison',
  imports: [ChartComponent],
  templateUrl: './series-comparison.html',
  styleUrl: './series-comparison.css',
})
export class SeriesComparison {
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
    animations: { enabled: false },
  };
  protected readonly xaxis: ApexXAxis = {
    type: 'datetime',
    title: { text: 'Time of Day' },
  };
  protected readonly title: ApexTitleSubtitle = {
    text: 'PM2.5 (µg/m³)',
  };
  protected readonly stroke: ApexStroke = {
    curve: 'smooth',
    width: [0, 2, 0, 2],
  };
  protected readonly colors = ['#00E396', '#00E396', '#008FFB', '#008FFB'];
  protected readonly fill = {
    opacity: [0.24, 1, 0.24, 1],
  };

  protected readonly series = computed<ApexAxisChartSeries>(() => {
    const rawRows = this.data();
    const year = this.date().getFullYear();

    const dataPointsByLabels = rawRows
      .map((row) => {
        const date = new Date(row.timestamp);
        const dateLabel = this.getDateLabel(date);
        const dayStr = format(startOfDay(date), 'yyyy-MM-dd');
        return {
          time: set(date, {
            year,
            month: 1,
            date: 1,
          }).getTime(),
          pm25: row.pm25,
          dayStr,
          dateLabel,
        };
      })
      .filter((x) => x.dateLabel !== 'exclude')
      .reduce((agg: any, val) => {
        const label = val.dateLabel;
        if (!agg[label]) {
          agg[label] = [];
        }

        agg[label].push(val);

        return agg;
      }, {});

    const foodMarketData = this.calculateSeriesStats(dataPointsByLabels['food-market-sunday']);
    const otherSundayData = this.calculateSeriesStats(dataPointsByLabels['other-sunday']);

    return [
      {
        name: 'St. Food Market Range (±1.96 SEM)',
        type: 'rangeArea',
        data: foodMarketData.range,
      },
      {
        name: 'St. Food Market Avg',
        type: 'line',
        data: foodMarketData.line,
      },
      {
        name: 'Other Sundays Range (±1.96 SEM)',
        type: 'rangeArea',
        data: otherSundayData.range,
      },
      {
        name: 'Other Sundays Avg',
        type: 'line',
        data: otherSundayData.line,
      },
    ];
  });

  private calculateSeriesStats(points: DataPoint[] | undefined) {
    const emptyResult = { line: [] as any[], range: [] as any[] };

    // Group raw readings by hour
    const hourlyValues: number[][] = Array.from({ length: 24 }, () => []);

    if (points) {
      points.forEach((point) => {
        const hour = new Date(point.time).getHours();
        if (point.pm25 !== null && point.pm25 !== undefined && !isNaN(point.pm25)) {
          hourlyValues[hour].push(point.pm25);
        }
      });
    }

    const baseDate = startOfYear(new Date());
    const lineData: any[] = [];
    const rangeData: any[] = [];

    for (let hour = 0; hour < 24; hour++) {
      const values = hourlyValues[hour];
      const count = values.length;

      const dateForHour = new Date(baseDate);
      dateForHour.setHours(hour, 0, 0, 0);

      if (count > 0) {
        // Calculate Mean (Average)
        const sum = values.reduce((acc, v) => acc + v, 0);
        const avg = sum / count;

        // Calculate Standard Deviation
        const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / count;
        const stdDev = Math.sqrt(variance);
        const stdErr = stdDev / Math.sqrt(count);

        // Keep values positive (PM2.5 cannot realistically drop below 0)
        const lowBound = Math.max(0, avg - 1.96 * stdErr);
        const highBound = avg + 1.96 * stdErr;

        lineData.push({
          x: dateForHour,
          y: Number(avg.toFixed(2)),
        });

        rangeData.push({
          x: dateForHour,
          y: [Number(lowBound.toFixed(2)), Number(highBound.toFixed(2))], // format required for 'rangeArea'
        });
      } else {
        lineData.push({ x: dateForHour, y: null });
        rangeData.push({ x: dateForHour, y: null });
      }
    }

    return { line: lineData, range: rangeData };
  }

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
      const yearStart = format(startOfYear(date), 'yyyy-MM-dd');
      const yearEnd = format(addDays(endOfYear(date), 1), 'yyyy-MM-dd');

      const sql = `
        SELECT
          timestamp,
          pm25,
        FROM DATA_FILE
        WHERE timestamp >= '${yearStart}' AND timestamp < '${yearEnd}'
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

  private getDateLabel(date: Date): 'food-market-sunday' | 'other-sunday' | 'exclude' {
    // Exclude January and days that are not Sunday
    if (date.getMonth() === 0) {
      return 'exclude';
    }
    if (date.getDay() !== 0) {
      return 'exclude';
    }

    const year = date.getFullYear();
    const dayOfMonth = date.getDate();

    const isFourthSundayOfMonth = dayOfMonth >= 22 && dayOfMonth <= 28;

    if (isFourthSundayOfMonth && year >= 2023) {
      // Street food market starts 2023-10-22
      if (year === 2023 && date.getMonth() < 9) return 'other-sunday';
      return 'food-market-sunday';
    }

    return 'other-sunday';
  }
}
