PROJECT BASELINE  |  ALL-IN-ONE APPLICATION

**ALL-IN-ONE APPLICATION**

Project Plan and Technical Baseline

A simple guide to the app's purpose, features, technology, and architecture.

Application name: To be decided

# 1. Project Overview

The project is one application that brings together three connected modules: Scheduler, Fitness, and Map. The goal is to help users organize their daily activities, manage exercise, and plan trips in one place.

The application will use one shared codebase. It will support desktop and mobile web browsers, installation as a Progressive Web App (PWA), and an Android APK. The application name will be decided later.

Scheduler: plan classes, personal tasks, projects, gaming, activities, and other events.

Fitness: create workout plans, record exercise sessions, and review progress.

Map: find places, view routes, and connect destinations to schedules.

Shared account: sign in with Google and keep each user's data private.

Offline-first use: save supported changes on the device and sync them when internet access returns.

# 2. Main Project Goals

Combine the three modules in one easy-to-use application.

Use a responsive design that works on phones, tablets, and computers.

Allow users to access previously saved information while offline.

Synchronize local changes with the user's Firebase account when internet access is available.

Keep each user's information separate and protected.

Connect related features, such as adding a workout to the calendar or opening a map route from a travel schedule.

Provide clear progress reports using line graphs.

# 3. Main Application Modules

## 3.1 Scheduler Module

The Scheduler helps users plan and track school, personal, and other activities.

### Schedule creation and management

Create, view, edit, delete, and duplicate schedules.

Add a title, category, description, date, start time, end time, location, reminder, repeat rule, color, and optional priority.

Choose categories such as School, Personal, Exercise, Gaming, Projects, Activities, Travel, or Custom.

Support one-time schedules and repeating schedules.

Support daily, weekly, selected-day, and custom repeat patterns.

Set a repeat start date and end date, such as the start and end of a semester.

Mark an item as completed, cancelled, missed, or postponed.

Search and filter schedules by title, category, date, and status.

Warn the user when two schedules overlap. The warning should not automatically prevent saving.

### Calendar

Provide day, week, month, and year calendar views.

Allow the user to select a date and view its schedules.

Provide date navigation and a shortcut to return to today.

Allow users to create a schedule from a selected calendar date.

Filter calendar items by category.

### COR upload and class schedule creation

Allow users to upload a Certificate of Registration (COR) as JPG, JPEG, PNG, or PDF.

Use OCR to read available subject names, subject codes, days, times, room locations, and instructor names.

Show the extracted information for review before creating schedules.

Let users correct any information that OCR reads incorrectly.

Create class schedules for a full semester or another selected academic period.

Allow users to manage current and previous academic periods and review past COR uploads.

Allow users to reprocess or delete uploaded documents.

Privacy note: COR files may contain personal information. Store them securely, limit access to the account owner, and provide a clear option to delete uploaded documents.

### Alarms and notifications

Offer alarm only, notification only, or both.

Allow reminder timing such as at the start time, 5, 10, 15, or 30 minutes before, 1 hour before, or a custom time.

Allow a user to choose a sound, preview it, adjust volume where supported, snooze, and dismiss.

Provide global reminder settings and per-schedule reminder settings.

Update reminders when a schedule changes and prevent duplicate reminders.

Restore scheduled reminders after an Android device restarts, where platform permissions allow it.

Platform limit: Android can support native alarm and notification behavior through Capacitor and native Android features. A web browser or PWA cannot guarantee that an alarm will run if the browser is closed or the device restricts background activity.

### Schedule history and sample data

Keep a history of completed, missed, and cancelled schedules.

Provide sample data for testing and demonstrations.

Clearly mark sample records so users can remove sample data without deleting their real records.

## 3.2 Fitness Module

The Fitness module helps users plan workouts and record exercise activity.

### Fitness dashboard

Show today's planned workout and upcoming workouts.

Show completed workouts, exercise time, and recent activity.

Provide weekly and monthly progress views.

Show workout history and progress graphs.

### Exercise library and workout builder

Group exercises into Cardio, Strength, Core, Flexibility, Mobility, and Recovery.

Show an exercise description, instructions, difficulty, target muscles where relevant, and suggested repetitions or duration.

Include demonstrations or illustrations when available.

Allow users to build custom workout routines.

Set exercises, sets, repetitions, duration, rest time, and workout schedule.

### Workout session tracking

Start, pause, resume, and finish a workout.

Skip an exercise or mark it as complete.

Record sets, repetitions, and exercise duration.

Provide a rest timer.

Save completed sessions to workout history.

### Exercise guidance

Provide general exercise information and step-by-step instructions.

Include reasonable rest and recovery reminders.

Use reliable health and fitness references, such as WHO, CDC, NHS, and ACSM.

Clearly explain that general exercise information is not a personal medical assessment.

Graph requirement: progress charts must use line graphs. Use line graphs for weekly or monthly exercise time, workout activity, and progress trends. Do not use bar graphs for these progress charts.

## 3.3 Map and Navigation Module

The Map module helps users find places and connect travel information with their schedules.

Use Google Maps Platform with coverage across the Philippines, subject to Google's available map data and service coverage.

Ask permission before accessing the device's current location.

Search for destinations and view available place details.

Save favorite places.

Choose a starting point and destination.

Show supported routes, estimated travel time, and distance.

Show alternative routes and supported travel modes, such as driving, walking, or cycling.

Allow users to open Google Maps for turn-by-turn navigation.

Allow optional GPS tracking while a user has started a tracking session.

Show movement and trip information such as distance and elapsed time.

Save route history only when the user enables that feature.

Schedule connection: a user can add a destination to a travel schedule. The schedule can open the map, show the route, and help the user plan when to leave.

Offline limit: saved places and previously stored information may remain available offline. Live place searches, traffic, route calculations, and updated navigation usually need internet access. Offline map features depend on what has been cached and what Google Maps services support.

# 4. Shared Features

## Google account and profile

Use Firebase Authentication with Google sign-in.

Create a user profile after the first successful sign-in.

Store basic profile details such as name, email, and profile photo.

Allow optional details such as user type, school, course, and year level.

Allow users to edit their profile and sign out.

Provide an account deletion process that also handles the user's stored data.

## Unified dashboard and activity system

Show today's schedules, upcoming activities, and active reminders.

Show a short fitness summary and recent activity.

Show online, offline, and synchronization status.

Provide quick actions for creating a schedule, starting a workout, or opening the map.

Connect related records across modules. For example, a workout can be linked to a calendar schedule.

## Search, history, and settings

Provide a shared search for schedules, subjects, activities, projects, exercises, and saved destinations.

Provide filters for category, date, and status.

Keep relevant schedule and workout history.

Provide light and dark themes, with Light as the default.

Provide account, reminder, calendar, fitness, location, privacy, sync, and storage settings.

Allow users to clear cache and remove sample data without accidentally removing personal records.

Turning reminders off must not delete schedules.

# 5. Offline Use and Data Synchronization

The application will follow an offline-first approach. When a user creates or edits supported information, the app saves the change to the local database first. It then adds the change to a synchronization queue. When internet access returns, the app sends pending changes to Firebase.

## Expected behavior

After the first successful sign-in and initial data setup, supported features should work without internet.

Users can create, view, edit, and delete supported local records while offline.

Offline changes remain on the device until they can be synchronized.

When the connection returns, the app automatically attempts to sync pending changes.

Changes made on another device should be downloaded and reflected locally.

Show whether data is saved locally, waiting to sync, syncing, or synchronized.

New Google sign-in and account switching require an internet connection, according to the product requirement.

Network-dependent services such as live map routes and cloud-based operations should clearly show when internet is required.

## Synchronization safety rules

Give every record a stable unique ID.

Give each queued operation its own unique operation ID.

Store creation and update timestamps.

Use version information or another clear method to detect conflicting edits.

Make retries safe so the same operation does not create duplicate records.

Use deletion markers when needed so a deleted record is not accidentally restored by another device.

Define a conflict policy before implementation, including what happens when the same record changes on two devices.

Keep cloud access restricted to the authenticated user's own records.

Product rule: the user has requested that sign-out and account switching be unavailable while offline. The implementation must also protect locally saved data and explain the restriction clearly.

# 6. Final Technology Stack

| **Area** | **Technology** | **Purpose** |
| --- | --- | --- |
| Frontend | React | Build the application interface and reusable components. |
| Build tool | Vite | Run the development server and create production builds. |
| Language | JavaScript | Main programming language for application logic. |
| UI framework | Bootstrap 5 | Responsive layout and common UI components. |
| Styling | SCSS / Sass | Custom design system and application styling. |
| Authentication | Firebase Authentication | Google account sign-in. |
| Cloud database | Cloud Firestore | Store account data in the cloud. |
| Cloud file storage | Firebase Storage | Store uploaded COR documents and supported files. |
| Web local database | IndexedDB | Store local web and PWA data. |
| Android local database | SQLite | Store local Android application data. |
| Native bridge | Capacitor | Connect the React application to Android capabilities. |
| Android development | Android Studio | Configure, test, and build the Android APK. |
| Web installation | PWA | Allow installation from a supported browser. |
| OCR | Google ML Kit on Android; Tesseract.js as a browser option | Read text from uploaded COR documents. |
| Maps | Google Maps Platform | Place search, maps, routes, and map-related features. |
| Graphs | Recharts LineChart | Display progress and activity trends as line graphs. |
| Version control | Git | Track code changes. |
| Remote repository | GitHub | Store and share the project repository. |

## Technologies not included

No Spring Boot.

No Java backend.

No MySQL backend.

No Tailwind CSS.

JavaScript is the main application language. Small native Android integrations may still require Android platform code or configuration.

# 7. Recommended Application Architecture

Recommended architecture: a Modular Monolith with a Shared Application Core and an Offline-First Data Layer. This means the project is one application with clearly separated modules and shared services, rather than three separate apps.

## Main layers

| **Layer** | **Main responsibility** |
| --- | --- |
| Presentation | React pages and components, Bootstrap layout, SCSS styles, responsive web and mobile screens. |
| Feature modules | Scheduler, Fitness, Map, and the shared dashboard. |
| Shared services | Authentication, reminders, calendar, activity, location, permissions, offline handling, and synchronization. |
| Repository / data access | A consistent way for features to create, read, update, and delete data without directly depending on a specific database. |
| Local storage | IndexedDB for web/PWA and SQLite for Android. |
| Cloud services | Firebase Authentication, Cloud Firestore, and Firebase Storage. |
| Platform integrations | Capacitor, Android alarms and notifications, location access, PWA support, OCR, and Google Maps. |

## How the layers work together

A user performs an action in a React screen, such as creating a schedule.

The screen calls the relevant application service.

The service uses a repository to save the information to the local database.

The app records a pending synchronization operation.

If internet is available, the synchronization service sends the change to Firebase.

When cloud data changes, the app updates the local database and refreshes the interface.

## Important architecture rules

React components should not directly contain Firestore, IndexedDB, or SQLite database logic.

Use repositories so the feature modules can work with a shared data interface.

Keep platform-specific features behind services or adapters.

Avoid running two separate synchronization systems for the same records without a clear reason.

Design recurring schedules with a schedule definition and dated occurrences, so each class or event can have its own completion status and history.

# 8. Suggested Data Organization

The exact database schema will be designed before implementation. A possible starting structure is:

users/{userId} — profile and account preferences.

users/{userId}/schedules — schedule definitions and related schedule data.

users/{userId}/academicPeriods — semesters, school years, and custom periods.

users/{userId}/subjects — extracted or manually entered subjects.

users/{userId}/workouts — workout plans and routines.

users/{userId}/exerciseHistory — completed workout sessions.

users/{userId}/destinations — saved places and destination details.

users/{userId}/reminders — reminder settings and related records.

users/{userId}/syncMetadata — synchronization state where needed.

Firebase Storage — uploaded COR files and other permitted user files.

This is a planning structure, not the final database schema. The final schema must support recurring schedule occurrences, offline updates, access rules, and safe synchronization.

# 9. Development Phases

**Phase 1 — Project foundation: **Create the React + Vite project, organize folders, set up Bootstrap and SCSS, and build the responsive layout.

**Phase 2 — Firebase and user accounts: **Configure Firebase, Google sign-in, user profiles, and user-specific security rules.

**Phase 3 — Shared application core: **Create shared models, services, repositories, error handling, and the common activity structure.

**Phase 4 — Scheduler and calendar: **Build schedule management, repeat rules, calendar views, filters, history, and conflict warnings.

**Phase 5 — Android reminders: **Build and test native Android alarms, notifications, permissions, and reminder restoration.

**Phase 6 — Local databases: **Implement IndexedDB for web/PWA and SQLite for Android through a clear shared data interface.

**Phase 7 — Offline synchronization: **Build the operation queue, automatic sync, conflict handling, retry rules, and sync status.

**Phase 8 — COR OCR: **Add document upload, text extraction, preview, correction, and class schedule generation.

**Phase 9 — Fitness module: **Build the exercise library, workout builder, session tracking, history, and line graphs.

**Phase 10 — Map module: **Add Google Maps, place search, location permission, routes, and schedule connections.

**Phase 11 — Unified dashboard: **Connect all modules and show useful summaries, quick actions, and activity information.

**Phase 12 — PWA support: **Configure the manifest, service worker, installation behavior, and offline web experience.

**Phase 13 — Android app: **Integrate Capacitor, configure Android permissions, test on devices, and build the APK.

**Phase 14 — Final testing and release preparation: **Test security, offline behavior, synchronization, reminders, accessibility, performance, and error handling.

# 10. Important Technical Notes and Limits

Google Maps Platform may require billing setup, API keys, usage limits, and correct key restrictions.

OCR results can contain mistakes. Always show extracted information for user review before creating schedules.

Android alarm reliability depends on Android permissions, device settings, battery restrictions, and the implementation.

PWA background behavior is more limited than native Android behavior.

Live navigation, traffic, cloud sync, and cloud OCR require an internet connection.

Offline storage is device-specific. Data on one device does not automatically exist on another until synchronization succeeds.

Firebase security rules must be tested to ensure one account cannot read or change another account's records.

The project should be built and tested in small phases instead of implementing every module at once.

# 11. Project Decisions Summary

One application with Scheduler, Fitness, and Map modules.

Application name remains undecided.

One React + Vite + JavaScript codebase.

Bootstrap 5 and SCSS for the interface.

Firebase Authentication, Cloud Firestore, and Firebase Storage for cloud services.

IndexedDB for web/PWA local storage and SQLite for Android local storage.

Capacitor and Android Studio for Android integration and APK building.

PWA installation for supported browsers.

Google Maps Platform for maps and navigation features.

Google ML Kit on Android and Tesseract.js as a browser OCR option.

Recharts LineChart for progress graphs. Do not use bar graphs for the required progress charts.

Git and GitHub for version control and remote project storage.

No Spring Boot, Java backend, MySQL backend, or Tailwind CSS.

# 12. What Must Be Designed Before Coding

This document confirms the project direction and technology choices. It does not yet define every technical detail. Before implementation, prepare the following specifications:

Final folder structure and module boundaries.

Detailed database schema for Firestore, IndexedDB, and SQLite.

Schedule recurrence and occurrence data model.

Offline synchronization flow, conflict rules, retry behavior, and deletion handling.

Firebase security rules and Storage access rules.

Android alarm and notification design, including required permissions.

COR upload, OCR, correction, and data retention flow.

Google Maps API setup, billing controls, and location permission flow.

Screen list, navigation flow, and responsive UI design.

Testing plan for web, PWA, Android, offline mode, and multiple accounts.

**END OF PROJECT BASELINE**

Project plan • Technology, features, and architecture