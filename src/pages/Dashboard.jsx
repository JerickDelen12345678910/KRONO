import { KPICard } from '../components/ui/KPICard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { NoteBanner } from '../components/ui/NoteBanner';
import { FilterChips } from '../components/ui/FilterChips';
import { LineChartWidget } from '../components/ui/LineChart';
import { Icon } from '../components/ui/Icon';
import { Row } from '../components/ui/Row';

const weeklyData = [20, 35, 0, 45, 30, 50, 40];
const weeklyLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const todayItems = [
  { time: '8:00', color: 'pri', title: 'Data Structures', subtitle: 'Room 304' },
  { time: '12:30', color: 'fit', title: 'Upper body workout', subtitle: 'Gym · 45 min', pill: <Pill variant="fit">Exercise</Pill> },
  { time: '15:00', color: 'prj', title: 'Capstone meeting', subtitle: 'Library', pill: <Pill variant="prj">Project</Pill> },
  { time: '17:30', color: 'map', title: 'Travel to Makati', subtitle: 'Leave by 4:45 PM', pill: <Pill variant="map">Travel</Pill> },
];

export function Dashboard() {
  return (
    <div>
      {/* KPI Row */}
      <section aria-labelledby="overview-heading">
        <h3 id="overview-heading" className="section-divider">Overview</h3>
        <div className="kpi-grid">
          <KPICard variant="pri" label="Classes today" value="2" subtitle="Next in 25 min" />
          <KPICard variant="fit" label="Workout" value="45 min" subtitle="12:30 PM · Gym" />
          <KPICard variant="map" label="Leave for Makati" value="4:45 PM" subtitle="42 min trip" />
          <KPICard variant="prj" label="Reminders on" value="2" subtitle="Alarm and notify" />
        </div>
      </section>

      {/* Today & Progress */}
      <section aria-labelledby="today-heading">
        <h3 id="today-heading" className="section-divider">Today and progress</h3>
        <div className="cols">
          {/* Left Column */}
          <div className="stack">
            {/* Next Up Card */}
            <div className="next-card">
              <small>Next up · in 25 minutes</small>
              <h3>Data Structures</h3>
              <small>8:00–9:30 AM · Room 304 · Prof. Reyes</small>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button fullWidth leftIcon="cal">Open</Button>
                <Button fullWidth variant="ghost">Snooze</Button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="qa-grid">
              <button className="qa-btn">
                <span className="icon-wrapper" style={{ background: 'var(--pri-s)', color: 'var(--pri)' }}>
                  <Icon name="plus" className="icon-xl" />
                </span>
                New schedule
              </button>
              <button className="qa-btn">
                <span className="icon-wrapper" style={{ background: 'var(--fit-s)', color: 'var(--fit)' }}>
                  <Icon name="play" className="icon-xl" />
                </span>
                Start workout
              </button>
              <button className="qa-btn">
                <span className="icon-wrapper" style={{ background: 'var(--map-s)', color: 'var(--map)' }}>
                  <Icon name="pin" className="icon-xl" />
                </span>
                Open map
              </button>
            </div>

            {/* Today's Schedule */}
            <Card variant="pri">
              <h3 className="ui-card-header">Today <span>4 items · 2 reminders on</span></h3>
              {todayItems.map((item, i) => (
                <Row key={i} time={item.time} barColor={item.color} title={item.title} subtitle={item.subtitle} tag={item.pill} />
              ))}
            </Card>
          </div>

          {/* Right Column */}
          <div className="stack">
            <Card variant="fit">
              <h3 className="ui-card-header">Exercise this week <span>minutes</span></h3>
              <LineChartWidget 
                data={weeklyData.map(v => ({ value: v }))} 
                labels={weeklyLabels} 
                color="var(--pri)"
              />
            </Card>
            <Card>
              <h3 className="ui-card-header">Sync <Pill variant="ok">Synced</Pill></h3>
              <div className="file-item">
                <span className="icon-btn" style={{ background: 'var(--pri-s)', color: 'var(--pri)' }}>
                  <Icon name="cloud" />
                </span>
                <div>
                  <b>All changes saved</b>
                  <small style={{ color: 'var(--mu)' }}>Last synced 2 min ago</small>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
