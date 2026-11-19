// src/lib/exerciseLibrary.js
// Phase 9 PACE 1 — the built-in exercise library: 30 exercises, 5 per category. Static data, not user data:
// it is never stored, synced or edited, so ids are stable strings ('ex-push-up'), not generated records.
// A workout item points at one by `exerciseId` (see createWorkoutItem in src/models/workout.js).
//
// Every field of an exercise matches createExercise() in src/models/workout.js (name, category, description,
// instructions, difficulty, targetMuscles, suggestedReps, suggestedDurationSec, mediaUrl), so validateExercise()
// accepts all of them; scripts/check-fitness.mjs proves it. No illustrations yet (mediaUrl stays null: the plan
// says "when available").
//
// CONTENT NOTE: this is general exercise information only (plan 3.2: not a personal medical assessment). It
// deliberately avoids numeric health claims and medical advice. Before release it should be reviewed against the
// references the plan names (WHO, CDC, NHS, ACSM).
//
// Counting convention: reps are per exercise as written ("each side" is said in the description); a time-based
// exercise uses suggestedDurationSec for ONE hold or round.

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(o);
};

// id, name, category, difficulty, targetMuscles, { reps | durationSec }, description, instructions
const ex = (id, name, category, difficulty, targetMuscles, amount, description, instructions) => ({
  id, name, category, difficulty, targetMuscles,
  suggestedReps: amount.reps ?? null, suggestedDurationSec: amount.durationSec ?? null,
  description, instructions, mediaUrl: null, isBuiltIn: true,
});

export const FITNESS_DISCLAIMER = 'General exercise information only. It is not a personal medical assessment.';

export const RECOVERY_REMINDERS = deepFreeze([
  'Warm up for a few minutes before you start, and cool down afterward.',
  'Rest between sets, and plan rest days so your body can recover.',
  'Drink water, and stop if you feel sharp pain, dizziness or chest discomfort. If you are unsure whether an exercise is right for you, ask a health professional.',
]);

export const EXERCISE_LIBRARY = deepFreeze([
  // ---- Cardio ----
  ex('ex-brisk-walk', 'Brisk walking', 'Cardio', 'Beginner', ['Legs', 'Heart and lungs'], { durationSec: 600 },
    'Walking fast enough to raise your heart rate while you can still hold a conversation.',
    ['Stand tall, look ahead and relax your shoulders.', 'Take quick, comfortable steps and swing your arms naturally.', 'Land on your heel and roll through to your toes.', 'Keep a pace where you can talk but not sing.']),
  ex('ex-jumping-jacks', 'Jumping jacks', 'Cardio', 'Beginner', ['Legs', 'Shoulders', 'Heart and lungs'], { durationSec: 30 },
    'A simple full-body move that raises your heart rate quickly.',
    ['Stand with your feet together and your arms at your sides.', 'Jump your feet apart while raising your arms overhead.', 'Jump back to the start position.', 'Keep a steady rhythm and land softly.']),
  ex('ex-high-knees', 'High knees', 'Cardio', 'Beginner', ['Hip flexors', 'Quadriceps', 'Heart and lungs'], { durationSec: 30 },
    'Running in place while lifting your knees toward hip height.',
    ['Stand tall with your feet hip-width apart.', 'Lift one knee toward hip height, then switch quickly to the other.', 'Pump your arms as you would when running.', 'Stay on the balls of your feet and keep your chest up.']),
  ex('ex-jump-rope', 'Jump rope', 'Cardio', 'Intermediate', ['Calves', 'Shoulders', 'Heart and lungs'], { durationSec: 60 },
    'Skipping over a rope, or mimicking the motion without one.',
    ['Hold the handles at hip height with your elbows close to your sides.', 'Turn the rope with your wrists, not your whole arms.', 'Hop just high enough to clear the rope.', 'Land softly on the balls of your feet.']),
  ex('ex-burpee', 'Burpee', 'Cardio', 'Advanced', ['Full body', 'Heart and lungs'], { reps: 8 },
    'A demanding full-body move; step instead of jump to make it easier.',
    ['Stand with your feet shoulder-width apart.', 'Squat down and place your hands on the floor.', 'Step or jump your feet back into a plank.', 'Step or jump your feet back to your hands.', 'Stand up, and add a small jump with your arms overhead if you can.']),

  // ---- Strength ----
  ex('ex-push-up', 'Push-ups', 'Strength', 'Intermediate', ['Chest', 'Shoulders', 'Triceps', 'Core'], { reps: 10 },
    'A bodyweight press for the chest, shoulders and arms; rest your knees on the floor to make it easier.',
    ['Start in a plank with your hands slightly wider than your shoulders.', 'Keep your body in one straight line from head to heels.', 'Bend your elbows to lower your chest toward the floor.', 'Press back up until your arms are straight.']),
  ex('ex-bodyweight-squat', 'Bodyweight squat', 'Strength', 'Beginner', ['Quadriceps', 'Glutes', 'Hamstrings'], { reps: 12 },
    'A basic lower-body move that trains the legs and hips.',
    ['Stand with your feet about shoulder-width apart.', 'Push your hips back and bend your knees as if sitting into a chair.', 'Keep your chest up and your knees in line with your toes.', 'Press through your whole foot to stand back up.']),
  ex('ex-lunge', 'Lunges', 'Strength', 'Beginner', ['Quadriceps', 'Glutes', 'Hamstrings'], { reps: 10 },
    'A single-leg move that builds leg strength and balance. Do the reps on each leg.',
    ['Stand tall with your feet together.', 'Step one foot forward and lower until both knees are bent.', 'Keep your front knee over your ankle and your torso upright.', 'Push through your front foot to return to standing, then switch legs.']),
  ex('ex-glute-bridge', 'Glute bridge', 'Strength', 'Beginner', ['Glutes', 'Hamstrings', 'Core'], { reps: 12 },
    'A floor exercise that strengthens the hips and the back of the legs.',
    ['Lie on your back with your knees bent and your feet flat on the floor.', 'Press through your heels and lift your hips until your body forms a straight line from shoulders to knees.', 'Squeeze your glutes at the top without arching your lower back.', 'Lower slowly to the floor.']),
  ex('ex-dumbbell-row', 'Dumbbell row', 'Strength', 'Intermediate', ['Upper back', 'Biceps', 'Shoulders'], { reps: 10 },
    'A pulling move for the upper back. Do the reps on each arm.',
    ['Place one hand and the same-side knee on a bench or sturdy seat, and hold a dumbbell in the other hand.', 'Keep your back flat and your head in line with your spine.', 'Pull the dumbbell toward your hip, keeping your elbow close to your body.', 'Lower it slowly until your arm is straight.']),

  // ---- Core ----
  ex('ex-plank', 'Plank', 'Core', 'Beginner', ['Core', 'Shoulders', 'Glutes'], { durationSec: 30 },
    'A hold that trains the muscles around your trunk to stay steady.',
    ['Place your forearms on the floor with your elbows under your shoulders.', 'Extend your legs behind you, balancing on your toes.', 'Keep your body in one straight line and your hips from sagging or lifting.', 'Breathe steadily and hold for the time shown.']),
  ex('ex-dead-bug', 'Dead bug', 'Core', 'Beginner', ['Deep core', 'Hip flexors'], { reps: 10 },
    'A slow floor exercise that teaches you to keep your lower back steady while your limbs move.',
    ['Lie on your back with your arms pointing up and your knees bent over your hips.', 'Slowly lower your right arm overhead and your left leg toward the floor.', 'Keep your lower back gently pressed toward the floor.', 'Return to the start and switch sides.']),
  ex('ex-bird-dog', 'Bird dog', 'Core', 'Beginner', ['Core', 'Lower back', 'Glutes'], { reps: 8 },
    'A balance move on hands and knees. Do the reps on each side.',
    ['Start on your hands and knees with your hands under your shoulders and knees under your hips.', 'Reach one arm forward and the opposite leg back at the same time.', 'Keep your hips level and your neck relaxed.', 'Return slowly and switch sides.']),
  ex('ex-bicycle-crunch', 'Bicycle crunch', 'Core', 'Intermediate', ['Abdominals', 'Obliques'], { reps: 16 },
    'A rotating crunch that works the front and sides of your trunk. Count each side.',
    ['Lie on your back with your hands lightly behind your head.', 'Lift your shoulders and bring one knee toward your chest.', 'Rotate your torso to bring the opposite elbow toward that knee while the other leg extends.', 'Switch sides in a smooth, controlled pedaling motion.']),
  ex('ex-russian-twist', 'Russian twist', 'Core', 'Intermediate', ['Obliques', 'Abdominals'], { reps: 20 },
    'A seated twist that works the sides of your trunk. Count each side.',
    ['Sit with your knees bent and lean back slightly, keeping your back straight.', 'Hold your hands together in front of your chest.', 'Rotate your torso to one side, then to the other.', 'Keep your feet on the floor to make it easier, or lift them to make it harder.']),

  // ---- Flexibility ----
  ex('ex-hamstring-stretch', 'Hamstring stretch', 'Flexibility', 'Beginner', ['Hamstrings', 'Calves'], { durationSec: 30 },
    'A gentle stretch for the back of the thigh. Hold it on each leg.',
    ['Sit on the floor with one leg straight and the other bent.', 'Keep your back long and hinge forward from your hips.', 'Reach toward your toes until you feel a mild stretch, not pain.', 'Hold steadily without bouncing, then switch legs.']),
  ex('ex-quad-stretch', 'Standing quad stretch', 'Flexibility', 'Beginner', ['Quadriceps', 'Hip flexors'], { durationSec: 30 },
    'A standing stretch for the front of the thigh. Hold it on each leg.',
    ['Stand tall, holding a wall or chair for balance if needed.', 'Bend one knee and hold your ankle behind you.', 'Keep your knees close together and your hips pointing forward.', 'Hold for the time shown, then switch legs.']),
  ex('ex-doorway-chest-stretch', 'Doorway chest stretch', 'Flexibility', 'Beginner', ['Chest', 'Front of shoulders'], { durationSec: 30 },
    'Opens the chest and front of the shoulders, helpful after a lot of desk time.',
    ['Stand in a doorway and rest your forearms on the frame, elbows at about shoulder height.', 'Step one foot forward through the doorway.', 'Lean gently forward until you feel a stretch across your chest.', 'Keep your ribs down and breathe steadily.']),
  ex('ex-childs-pose', "Child's pose", 'Flexibility', 'Beginner', ['Lower back', 'Hips', 'Shoulders'], { durationSec: 45 },
    'A restful stretch for the back and hips.',
    ['Kneel on the floor with your big toes together and your knees apart.', 'Sit your hips back toward your heels.', 'Reach your arms forward and rest your forehead on the floor.', 'Breathe slowly and let your body relax.']),
  ex('ex-cross-body-shoulder-stretch', 'Cross-body shoulder stretch', 'Flexibility', 'Beginner', ['Shoulders', 'Upper back'], { durationSec: 30 },
    'A simple stretch for the back of the shoulder. Hold it on each arm.',
    ['Bring one arm straight across your chest.', 'Use your other hand to hold it gently just above the elbow.', 'Keep your shoulders down and relaxed.', 'Hold for the time shown, then switch arms.']),

  // ---- Mobility ----
  ex('ex-cat-cow', 'Cat-cow', 'Mobility', 'Beginner', ['Spine', 'Core'], { reps: 10 },
    'A slow spine movement that loosens the back.',
    ['Start on your hands and knees.', 'Breathe in as you let your belly drop and lift your chest and tailbone.', 'Breathe out as you round your back toward the ceiling and tuck your chin.', 'Move smoothly with your breathing.']),
  ex('ex-arm-circles', 'Arm circles', 'Mobility', 'Beginner', ['Shoulders', 'Upper back'], { reps: 10 },
    'A warm-up movement for the shoulders. Do the reps in each direction.',
    ['Stand tall with your arms out to the sides at shoulder height.', 'Make small circles forward, gradually making them larger.', 'Reverse the direction for the same number of circles.', 'Keep your shoulders relaxed and away from your ears.']),
  ex('ex-hip-circles', 'Hip circles', 'Mobility', 'Beginner', ['Hips', 'Glutes'], { reps: 10 },
    'A standing movement that loosens the hips. Do the reps in each direction.',
    ['Stand on one leg, holding a wall or chair for balance if needed.', 'Lift the other knee and draw a slow circle with it.', 'Reverse the direction, then switch legs.', 'Keep your standing leg slightly bent and your torso still.']),
  ex('ex-open-book', 'Open book rotation', 'Mobility', 'Beginner', ['Upper back', 'Chest', 'Shoulders'], { reps: 8 },
    'A lying rotation that frees up the upper back. Do the reps on each side.',
    ['Lie on your side with your knees bent and stacked, and your arms straight out in front of you.', 'Lift your top arm and open it up and back, following your hand with your eyes.', 'Go only as far as is comfortable, keeping your knees together.', 'Return to the start and repeat.']),
  ex('ex-ankle-circles', 'Ankle circles', 'Mobility', 'Beginner', ['Ankles', 'Calves'], { reps: 10 },
    'A gentle movement for stiff ankles. Do the reps in each direction, on each foot.',
    ['Sit or stand and lift one foot slightly off the floor.', 'Draw slow circles with your toes.', 'Reverse the direction.', 'Switch feet.']),

  // ---- Recovery ----
  ex('ex-diaphragmatic-breathing', 'Diaphragmatic breathing', 'Recovery', 'Beginner', ['Diaphragm'], { durationSec: 120 },
    'Slow belly breathing to help you settle after exercise.',
    ['Sit or lie down comfortably and place one hand on your belly.', 'Breathe in slowly through your nose so your belly rises.', 'Breathe out slowly through your mouth.', 'Keep your shoulders relaxed and repeat for the time shown.']),
  ex('ex-cooldown-walk', 'Easy cool-down walk', 'Recovery', 'Beginner', ['Legs', 'Heart and lungs'], { durationSec: 300 },
    'A relaxed walk that lets your heart rate come down gradually after a workout.',
    ['Walk at an easy, comfortable pace.', 'Let your arms swing naturally and breathe normally.', 'Gradually slow down over the time shown.']),
  ex('ex-legs-up-wall', 'Legs up the wall', 'Recovery', 'Beginner', ['Legs', 'Lower back'], { durationSec: 180 },
    'A resting position that takes the load off your legs.',
    ['Sit sideways next to a wall.', 'Lie back and swing your legs up the wall.', 'Rest your arms by your sides and breathe slowly.', 'Bend your knees and roll to the side to come out.']),
  ex('ex-neck-stretch', 'Gentle neck stretch', 'Recovery', 'Beginner', ['Neck', 'Upper shoulders'], { durationSec: 30 },
    'A light stretch for a tight neck. Hold it on each side.',
    ['Sit or stand tall with your shoulders relaxed.', 'Tilt your head gently toward one shoulder.', 'Stay relaxed and do not pull on your head.', 'Hold for the time shown, then switch sides.']),
  ex('ex-body-scan', 'Body-scan relaxation', 'Recovery', 'Beginner', ['Whole body'], { durationSec: 180 },
    'A quiet exercise where you relax one part of the body at a time.',
    ['Lie down comfortably and close your eyes.', 'Start at your feet and notice how they feel, then let them relax.', 'Move slowly upward through your legs, hips, belly, chest, arms, neck and face.', 'Breathe slowly throughout.']),
]);

// ---- lookups (pure) ----
export const getExerciseById = (id) => EXERCISE_LIBRARY.find((e) => e.id === id) ?? null;

/** listExercises({ category, difficulty, query }) — each filter optional; `query` matches name, description and target muscles. */
export function listExercises({ category, difficulty, query } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  return EXERCISE_LIBRARY.filter((e) => (
    (!category || e.category === category)
    && (!difficulty || e.difficulty === difficulty)
    && (!q || [e.name, e.description, ...e.targetMuscles].some((t) => t.toLowerCase().includes(q)))
  ));
}