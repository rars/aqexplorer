import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DuckDbService } from '../../services/duckdb/duck-db';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexPlotOptions,
  ApexTitleSubtitle,
  ChartComponent,
} from 'ng-apexcharts';
import { format } from 'date-fns';

interface Pm25Point {
  date: Date;
  maxPm25: number;
}

@Component({
  selector: 'app-aqi-heatmap',
  imports: [ChartComponent],
  templateUrl: './aqi-heatmap.html',
  styleUrl: './aqi-heatmap.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AqiHeatmap {
  public dateChange = output<Date>();
  public year = input<number>(2025);

  private readonly duckDb = inject(DuckDbService);
  public series = signal<ApexAxisChartSeries>([]);
  public chart = signal<ApexChart | undefined>(undefined);
  public plotOptions = signal<ApexPlotOptions | undefined>(undefined);
  public title!: ApexTitleSubtitle;

  readonly daysOfWeek = [
    'Sunday',
    'Saturday',
    'Friday',
    'Thursday',
    'Wednesday',
    'Tuesday',
    'Monday',
  ];

  protected readonly chartConfiguration = computed(() => {
    const chartData = this.chart();
    const plotOptionsData = this.plotOptions();
    const seriesData = this.series();

    if (!chartData || !plotOptionsData || !seriesData || seriesData.length === 0) {
      return null;
    }

    return {
      chart: chartData,
      plotOptions: plotOptionsData,
      series: seriesData,
    };
  });

  public constructor() {
    effect(() => {
      this.loadData(this.year());
    });
  }

  private async loadData(year: number): Promise<void> {
    const rawData = await this.duckDb.queryParquet(`
      SELECT CAST(timestamp AS DATE) AS date, MAX(pm25) AS maxPm25
      FROM DATA_FILE
      WHERE CAST(timestamp AS DATE) >= '${year}-01-01' AND CAST(timestamp AS DATE) <= '${year}-12-31'
      AND pm25 IS NOT NULL
      GROUP BY CAST(timestamp AS DATE)
    `);

    this.prepareHeatmapData(rawData);
    this.initChartOptions(year);
  }

  private prepareHeatmapData(data: Pm25Point[]) {
    const matrix: { [day: string]: { [week: string]: { value: number; date: Date } } } = {};
    const allWeeks = new Set<string>();

    this.daysOfWeek.forEach((day) => (matrix[day] = {}));

    data.forEach((point) => {
      const dateObj = new Date(point.date);
      const dayName = format(dateObj, 'EEEE');
      const weekIdentifier = this.getWeekIdentifier(dateObj);
      allWeeks.add(weekIdentifier);

      matrix[dayName][weekIdentifier] = {
        value: Math.round(point.maxPm25),
        date: dateObj,
      };
    });

    const sortedWeeks = Array.from(allWeeks).sort();

    this.series.set(
      this.daysOfWeek.map((day) => {
        return {
          name: day,
          data: sortedWeeks.map((week) => ({
            x: week,
            y: matrix[day][week]?.value !== undefined ? matrix[day][week].value : 0,
            meta: { date: matrix[day][week]?.date || null },
          })),
        };
      }),
    );
  }

  private getWeekIdentifier(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
  }

  private initChartOptions(year: number) {
    this.chart.set({
      height: 350,
      type: 'heatmap',
      zoom: { enabled: false },
      toolbar: { show: false },
      events: {
        dataPointSelection: (event, chartContext, config) => {
          const seriesIndex = config.seriesIndex;
          const dataPointIndex = config.dataPointIndex;
          const clickedDataPoint = config.w.config.series[seriesIndex].data[dataPointIndex];

          if (clickedDataPoint && clickedDataPoint.meta?.date) {
            this.dateChange.emit(clickedDataPoint.meta.date);
          }
        },
      },
    });

    this.plotOptions.set({
      heatmap: {
        shadeIntensity: 0,
        radius: 0,
        useFillColorAsStroke: true,
        colorScale: {
          ranges: [
            { from: 0, to: 12, name: 'Good (0-12)', color: '#2ecc71' },
            { from: 12.1, to: 35.4, name: 'Moderate', color: '#f1c40f' },
            { from: 35.5, to: 55.4, name: 'Unhealthy Context', color: '#e67e22' },
            { from: 55.5, to: 9999, name: 'Severe Spike', color: '#e74c3c' },
          ],
        },
      },
    });

    this.title = {
      text: `${year} Peak Daily PM2.5 Levels`,
    };
  }
}
