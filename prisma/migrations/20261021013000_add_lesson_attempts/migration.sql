-- CreateTable
CREATE TABLE "lesson_attempts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner_id" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "attempt" TEXT NOT NULL,
    "saved_at" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_attempts_one_each" ON "lesson_attempts"("owner_id", "course", "attempt");
