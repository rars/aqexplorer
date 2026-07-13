import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { DayView } from './components/day-view/day-view';
import { DataDensity } from './components/data-density/data-density';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { getYear } from 'date-fns';

@Component({
  selector: 'app-root',
  imports: [DayView, DataDensity, MatFormFieldModule, MatInputModule, MatDatepickerModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly selectedDate = signal<Date>(new Date('2025-09-28'));

  protected onDateChange(newDate: any): void {
    if (newDate) {
      const nativeDate = new Date(newDate);
      this.selectedDate.set(nativeDate);
    }
  }

  protected getFullYear(date: Date): number {
    return getYear(date);
  }
}
