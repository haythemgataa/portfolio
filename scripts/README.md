# Content Migration Script

This script migrates the content structure from a single `profileData.json` file to a directory-based organization.

## Prerequisites

Install dependencies:
```bash
npm install
```

## Usage

Run the migration script:
```bash
npm run migrate
```

## What it does

1. **Creates `001-general/` directory**
   - Extracts general profile data to `general.json`
   - Moves `profilePhoto.jpg` to `media/` subdirectory
   - Removes `sectionOrder` (directory order will be used instead)

2. **Creates section directories** (e.g., `002-workExperience/`, `003-education/`)
   - For each section in `sectionOrder`, creates a directory with numeric prefix
   - Processes all items in each section

3. **Creates item directories** (e.g., `001-product-designer-at-instadeep/`)
   - For each item, generates a slug from the heading
   - Creates directory with numeric prefix for ordering
   - Moves item data to `item.json`
   - Moves associated media files to `media/` subdirectory
   - Updates media paths in `item.json` to store just filenames

4. **Moves markdown files**
   - Moves all `.md` files from `content/` to `case-studies/` directory

## After Migration

- The original `profileData.json` and `media/` directory remain intact
- Verify the new structure works correctly
- Once verified, you can delete the old files:
  - `public/content/profileData.json`
  - `public/content/media/` (all files should be moved to item directories)

## Notes

- The script preserves all data and only reorganizes the structure
- Media files are copied (not moved) to preserve originals until verification
- Item ordering is preserved based on array order in the original JSON
- Section ordering follows the `sectionOrder` array from the original JSON
