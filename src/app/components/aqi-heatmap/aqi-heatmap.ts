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
  ApexDataLabels,
  ApexAxisChartSeries,
  ApexChart,
  ApexPlotOptions,
  ApexTitleSubtitle,
  ChartComponent,
} from 'ng-apexcharts';
import { format, getWeekOfMonth } from 'date-fns';

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
  public dataLabels = signal<ApexDataLabels | undefined>(undefined);
  public title!: ApexTitleSubtitle;
  public readonly subtitle: ApexTitleSubtitle = {
    text: '* denotes likely street food market that occurs on the 4th Sunday of each month',
    align: 'left',
    style: {
      fontSize: '12px',
      color: '#64748b', // A clean, muted slate gray
    },
  };

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
    const dataLabelsData = this.dataLabels();

    if (
      !chartData ||
      !plotOptionsData ||
      !seriesData ||
      seriesData.length === 0 ||
      !dataLabelsData
    ) {
      return null;
    }

    return {
      chart: chartData,
      plotOptions: plotOptionsData,
      series: seriesData,
      dataLabels: dataLabelsData,
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
    const matrix: {
      [day: string]: {
        [week: string]: { value: number; date: Date; isStreetFoodMarketSunday: boolean };
      };
    } = {};
    const allWeeks = new Set<string>();

    this.daysOfWeek.forEach((day) => (matrix[day] = {}));

    data.forEach((point) => {
      const dateObj = new Date(point.date);
      const dayName = format(dateObj, 'EEEE');
      const weekIdentifier = this.getWeekIdentifier(dateObj);
      allWeeks.add(weekIdentifier);

      const isStreetFoodMarketSunday = dateObj ? this.isStreetFoodMarketSunday(dateObj) : false;

      matrix[dayName][weekIdentifier] = {
        value: Math.round(point.maxPm25),
        date: dateObj,
        isStreetFoodMarketSunday,
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
            meta: {
              date: matrix[day][week]?.date || null,
              isStreetFoodMarketSunday: matrix[day][week]?.isStreetFoodMarketSunday,
            },
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

    this.dataLabels.set({
      enabled: true,
      formatter: (val: any, opts: any) => {
        const pm25Value = opts.w.config.series[opts.seriesIndex]?.data[opts.dataPointIndex]?.y;

        const isStreetFoodMarketSunday =
          opts.w.config.series[opts.seriesIndex].data[opts.dataPointIndex].meta
            ?.isStreetFoodMarketSunday;

        if (pm25Value === 0 || pm25Value === undefined) return '';

        return isStreetFoodMarketSunday ? `${pm25Value}*` : `${pm25Value}`;
      },
      style: {
        fontSize: '14px',
        colors: ['#fff'], // Keeps the emoji readable over the cell colors
      },
    });

    this.title = {
      text: `${year} Peak Daily PM2.5 Levels`,
    };
  }

  private isStreetFoodMarketSunday(date: Date): boolean {
    // Exclude January and days that are not Sunday
    if (date.getMonth() === 0) return false;
    if (date.getDay() !== 0) return false;

    const year = date.getFullYear();
    const dayOfMonth = date.getDate();

    const isFourthSundayOfMonth = dayOfMonth >= 22 && dayOfMonth <= 28;

    if (isFourthSundayOfMonth && year >= 2023) {
      // Street food market starts 2023-10-22
      if (year === 2023 && date.getMonth() < 9) return false;
      return true;
    }

    return false;
  }
}
