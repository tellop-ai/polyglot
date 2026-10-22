-- CreateTable
CREATE TABLE "spoken_sounds" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner_id" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "text_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sound_file" TEXT NOT NULL,
    "saved_at" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "spoken_sounds_one_each" ON "spoken_sounds"("owner_id", "course", "voice", "text_key");
