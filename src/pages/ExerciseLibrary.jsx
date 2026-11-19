import { useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { FITNESS_DISCLAIMER } from '../lib/exerciseLibrary.js';
import {
  CATEGORY_OPTIONS, DIFFICULTY_OPTIONS, emptyResultText, exerciseRow, filtersFromParams, hasActiveFilters, paramsFromFilters, resultSummary, serviceFilters,
} from '../lib/exerciseView.js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FilterChips } from '../components/ui/FilterChips';
import { Icon } from '../components/ui/Icon';
import { Pill } from '../components/ui/Pill';
import { Row } from '../components/ui/Row';

// Built-in exercise library (static data): browse by category and level, or search by name or muscle.
// The filters live in the URL, so "back" from an exercise returns to the same list.
export function ExerciseLibrary() {
  const { workout } = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const total = workout.exerciseCount();
  const rows = useMemo(() => workout.listExercises(serviceFilters(filters)).map(exerciseRow), [workout, filters]);
  const update = (changes) => setParams(paramsFromFilters({ ...filters, ...changes }), { replace: true });

  return (
    <div>
      <div className="mb-3">
        <Button variant="ghost" size="sm" leftIcon="left" onClick={() => navigate('/fitness')}>Fitness</Button>
      </div>

      <section aria-labelledby="exlib-heading">
        <h3 id="exlib-heading" className="section-divider">Exercise library</h3>
        <div className="stack">
          <div className="exercise-filters">
            <label className="form-field">
              <span>Search exercises</span>
              <input
                type="search"
                value={filters.query}
                onChange={(e) => update({ query: e.target.value })}
                placeholder="Name or muscle, e.g. plank"
                maxLength={60}
                autoComplete="off"
              />
            </label>
            <FilterChips options={CATEGORY_OPTIONS} value={filters.category} onChange={(category) => update({ category })} label="Exercise category" />
            <FilterChips options={DIFFICULTY_OPTIONS} value={filters.difficulty} onChange={(difficulty) => update({ difficulty })} label="Difficulty" />
          </div>

          <Card variant="fit" header={<>Exercises <span role="status">{resultSummary(rows.length, total)}</span></>}>
            {rows.length === 0 ? (
              <>
                <p className="empty-hint">{emptyResultText(filters)}</p>
                {hasActiveFilters(filters) && <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}
              </>
            ) : (
              <div className="exercise-list">
                {rows.map((r) => (
                  <Link key={r.id} className="exercise-link" to={`/fitness/exercises/${r.id}`} state={{ search: location.search }}>
                    <Row
                      time={r.amount}
                      barColor="fit"
                      title={r.title}
                      subtitle={r.subtitle}
                      tag={<span className="exercise-tag"><Pill variant="fit">{r.difficulty}</Pill><Icon name="right" size={16} /></span>}
                    />
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <small className="fit-note">{FITNESS_DISCLAIMER}</small>
        </div>
      </section>
    </div>
  );
}