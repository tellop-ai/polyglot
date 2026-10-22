-- CreateTable
CREATE TABLE "learners" (
    "owner_id" TEXT NOT NULL PRIMARY KEY,
    "own_language" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "study_days" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "lessons_per_day" INTEGER NOT NULL DEFAULT 1,
    "cards_per_day" INTEGER NOT NULL DEFAULT 20,
    "read_aloud" BOOLEAN NOT NULL DEFAULT true,
    "voice_speed" TEXT NOT NULL DEFAULT 'normal',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "courses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner_id" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "start_level" TEXT NOT NULL DEFAULT '',
    "test_right" INTEGER NOT NULL DEFAULT 0,
    "test_total" INTEGER NOT NULL DEFAULT 0,
    "tested_at" TEXT NOT NULL DEFAULT '',
    "voice" TEXT NOT NULL DEFAULT '',
    "started_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "lesson_results" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner_id" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "best_right" INTEGER NOT NULL,
    "last_right" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "times" INTEGER NOT NULL DEFAULT 1,
    "first_done_at" TEXT NOT NULL,
    "last_done_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "study_days" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner_id" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "lessons" INTEGER NOT NULL DEFAULT 0,
    "cards" INTEGER NOT NULL DEFAULT 0,
    "known" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "word_cards" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner_id" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "card" TEXT NOT NULL,
    "front" TEXT NOT NULL DEFAULT '',
    "back" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "step" INTEGER NOT NULL DEFAULT 1,
    "due_day" TEXT NOT NULL,
    "seen" INTEGER NOT NULL DEFAULT 0,
    "knew_times" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TEXT NOT NULL DEFAULT '',
    "added_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_one_each" ON "courses"("owner_id", "course");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_results_one_each" ON "lesson_results"("owner_id", "course", "lesson");

-- CreateIndex
CREATE UNIQUE INDEX "study_days_one_each" ON "study_days"("owner_id", "course", "day");

-- CreateIndex
CREATE INDEX "word_cards_due" ON "word_cards"("owner_id", "course", "due_day");

-- CreateIndex
CREATE UNIQUE INDEX "word_cards_one_each" ON "word_cards"("owner_id", "course", "card");
