import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DayView } from './components/day-view/day-view';

@Component({
  selector: 'app-root',
  imports: [DayView],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
