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
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ApexDataLabels,
  ApexAxisChartSeries,
  ApexChart,
  ApexPlotOptions,
  ApexTitleSubtitle,
  ChartComponent,
} from 'ng-apexcharts';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { map } from 'rxjs';

interface Pm25Point {
  date: Date;
  maxPm25: number;
}

type ViewSize = 'small' | 'medium' | 'large' | 'xlarge';

@Component({
  selector: 'app-aqi-heatmap',
  imports: [ChartComponent],
  templateUrl: './aqi-heatmap.html',
  styleUrl: './aqi-heatmap.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AqiHeatmap {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly duckDb = inject(DuckDbService);

  public readonly activeDate = input.required<Date>();
  private readonly dedupedActiveDate = computed(() => this.activeDate(), {
    equal: (a, b) => a?.getTime() === b?.getTime(),
  });
  public readonly year = computed(() => this.dedupedActiveDate().getFullYear());
  public readonly dateChange = output<Date>();

  public readonly series = signal<ApexAxisChartSeries>([]);
  public readonly chart = signal<ApexChart | undefined>(undefined);
  public readonly plotOptions = signal<ApexPlotOptions | undefined>(undefined);
  public readonly dataLabels = signal<ApexDataLabels | undefined>(undefined);
  public readonly title = signal<ApexTitleSubtitle | undefined>(undefined);
  public readonly subtitle: ApexTitleSubtitle = {
    text: '* denotes likely street food market that occurs on the 4th Sunday of each month',
    align: 'left',
    style: {
      fontSize: '12px',
      color: '#64748b', // A clean, muted slate gray
    },
  };

  private readonly daysOfWeek = [
    'Sunday',
    'Saturday',
    'Friday',
    'Thursday',
    'Wednesday',
    'Tuesday',
    'Monday',
  ];

  private lastViewSize: ViewSize | null = null;
  private lastDateRangeKey: string = '';

  protected readonly isChartReady = computed(() => {
    const chartData = this.chart();
    const plotOptionsData = this.plotOptions();
    const seriesData = this.series();
    const dataLabelsData = this.dataLabels();
    const titleData = this.title();

    return (
      chartData &&
      plotOptionsData &&
      seriesData &&
      seriesData.length !== 0 &&
      dataLabelsData &&
      titleData
    );
  });

  protected viewSize = toSignal(
    this.breakpointObserver
      .observe([
        '(max-width: 767px)',
        '(min-width: 768px) and (max-width: 1199px)',
        '(min-width: 1200px) and (max-width: 1725px)',
      ])
      .pipe(
        map((result) => {
          if (result.breakpoints['(max-width: 767px)']) return 'small';
          if (result.breakpoints['(min-width: 768px) and (max-width: 1199px)']) return 'medium';
          if (result.breakpoints['(min-width: 1200px) and (max-width: 1725px)']) return 'large';
          return 'xlarge';
        }),
      ),
    { initialValue: 'xlarge' },
  );

  public constructor() {
    effect(() => {
      const viewSize = this.viewSize();
      const activeDate = this.dedupedActiveDate();

      this.loadData(activeDate, this.year(), viewSize);
    });

    effect(() => {
      this.initChartOptions(this.year());
    });
  }

  private async loadData(activeDate: Date, year: number, viewSize: ViewSize): Promise<void> {
    const rawData = await this.duckDb.queryParquet(`
      SELECT CAST(timestamp AS DATE) AS date, MAX(pm25) AS maxPm25
      FROM DATA_FILE
      WHERE CAST(timestamp AS DATE) >= '${year}-01-01' AND CAST(timestamp AS DATE) <= '${year}-12-31'
      AND pm25 IS NOT NULL
      GROUP BY CAST(timestamp AS DATE)
    `);

    this.prepareHeatmapData(rawData, activeDate, viewSize);
  }

  private prepareHeatmapData(data: Pm25Point[], activeDate: Date, viewSize: ViewSize) {
    const matrix: {
      [day: string]: {
        [week: string]: { value: number; date: Date; isStreetFoodMarketSunday: boolean };
      };
    } = {};
    const allWeeks = new Set<string>();

    this.daysOfWeek.forEach((day) => (matrix[day] = {}));

    let monthStart: Date | null = null;
    let endMonth: Date | null = null;

    switch (viewSize) {
      case 'small': {
        monthStart = startOfWeek(addDays(startOfMonth(activeDate), -15), { weekStartsOn: 1 });
        endMonth = endOfWeek(addDays(endOfMonth(activeDate), 15), { weekStartsOn: 1 });

        break;
      }
      case 'medium': {
        monthStart = startOfWeek(addMonths(startOfMonth(activeDate), -2), {
          weekStartsOn: 1,
        });
        endMonth = endOfWeek(addMonths(endOfMonth(activeDate), 2), { weekStartsOn: 1 });

        break;
      }
      case 'large': {
        monthStart = startOfWeek(addMonths(startOfMonth(activeDate), -3), {
          weekStartsOn: 1,
        });
        endMonth = endOfWeek(addMonths(endOfMonth(activeDate), 3), { weekStartsOn: 1 });

        break;
      }
    }

    const dateRangeKey =
      monthStart && endMonth
        ? `${monthStart.getTime()}-${endMonth.getTime()}`
        : `full-year-${activeDate.getFullYear()}`;

    if (viewSize === this.lastViewSize && dateRangeKey === this.lastDateRangeKey) {
      return;
    }

    this.lastViewSize = viewSize;
    this.lastDateRangeKey = dateRangeKey;

    if (monthStart && endMonth) {
      data = data.filter((x) => x.date >= monthStart && x.date < endMonth);
    }

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

    this.title.set({
      text: `${year} Peak Daily PM2.5 Levels`,
    });
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
