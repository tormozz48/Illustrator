-- Create book_status enum
CREATE TYPE "public"."book_status" AS ENUM('uploading', 'splitting', 'generatingBible', 'illustrating', 'assembling', 'published', 'failed');

-- Create chapter_status enum
CREATE TYPE "public"."chapter_status" AS ENUM('pending', 'processing', 'completed', 'failed');

-- Create books table
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "book_status" DEFAULT 'uploading' NOT NULL,
	"original_file_url" text,
	"final_pdf_url" text,
	"style_bible" jsonb,
	"expected_chapters" text,
	"completed_chapters" text DEFAULT '0',
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create chapters table
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"chapter_number" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" "chapter_status" DEFAULT 'pending' NOT NULL,
	"scene_description" text,
	"illustration_url" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes for performance
CREATE INDEX "chapters_book_id_idx" ON "chapters" ("book_id");
CREATE INDEX "books_user_id_idx" ON "books" ("user_id");
CREATE INDEX "books_status_idx" ON "books" ("status");
CREATE INDEX "chapters_status_idx" ON "chapters" ("status");
