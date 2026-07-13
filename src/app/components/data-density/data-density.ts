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
  ApexXAxis,
  ChartComponent,
} from 'ng-apexcharts';
import { format } from 'date-fns';

interface DataPoint {
  date: Date;
  count: number;
}

@Component({
  selector: 'app-data-density',
  imports: [ChartComponent],
  templateUrl: './data-density.html',
  styleUrl: './data-density.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataDensity {
  public dateChange = output<Date>();
  public year = input<number>(2025);

  private readonly duckDb = inject(DuckDbService);
  public series = signal<ApexAxisChartSeries>([]);
  public chart = signal<ApexChart | undefined>(undefined);
  public plotOptions = signal<ApexPlotOptions | undefined>(undefined);
  public xaxis!: ApexXAxis;
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
      SELECT CAST(timestamp AS DATE) AS date, COUNT(*) AS count
      FROM DATA_FILE
      WHERE CAST(timestamp AS DATE) >= '${year}-01-01' AND CAST(timestamp AS DATE) <= '${year}-12-31'
      AND pm25 IS NOT NULL
      GROUP BY CAST(timestamp AS DATE)
    `);

    this.prepareHeatmapData(rawData);
    this.initChartOptions(year);
  }

  private prepareHeatmapData(data: DataPoint[]) {
    const matrix: { [day: string]: { [week: string]: { count: number; date: Date } } } = {};
    const allWeeks = new Set<string>();

    this.daysOfWeek.forEach((day) => (matrix[day] = {}));

    data.forEach((point) => {
      const dateObj = new Date(point.date);

      const dayName = format(dateObj, 'EEEE');

      const weekIdentifier = this.getWeekIdentifier(dateObj);
      allWeeks.add(weekIdentifier);

      matrix[dayName][weekIdentifier] = { count: point.count, date: dateObj };
    });

    const sortedWeeks = Array.from(allWeeks).sort();

    this.series.set(
      this.daysOfWeek.map((day) => {
        return {
          name: day,
          data: sortedWeeks.map((week) => ({
            x: week,
            y: matrix[day][week]?.count !== undefined ? matrix[day][week].count : 0,
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
            { from: 0, to: 9, name: 'Low Data', color: '#ecf0f1 ' },
            { from: 10, to: 23, name: 'Medium', color: '#fe9929' },
            { from: 24, to: 24, name: 'High', color: '#1f78b4' },
          ],
        },
      },
    });

    this.title = {
      text: `${year} Number of data points (expected 24 per day)`,
    };
  }
}
