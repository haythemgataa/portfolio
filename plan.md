# Restructure Content to Directory-Based Organization

## Current Structure

- `public/content/profileData.json` - single JSON file with all data
- `public/content/media/` - all media files in one directory
- `public/content/*.md` - markdown case study files

## New Structure

```
public/content/
  001-general/
    general.json
    media/
      profilePhoto.jpg
  002-workExperience/
    001-product-designer-at-instadeep/
      item.json
      media/
        Product-designer-at-InstaDeep-1.png
        Product-designer-at-InstaDeep-2.png
        ...
    002-ui-designer-at-weare-moon/
      item.json
      media/
        ...
  003-education/
    001-master-in-software-engineering-at-ecole-polytechnique-sousse/
      item.json
    002-bachelor-in-computer-science-at-higher-institute-of-computer-science/
      item.json
    ...
  004-awards/
    001-best-website-design-silver-award-from-tunisia-digital-awards/
      item.json
      media/
        ...
    ...
  005-speaking/
    designers-toolbox-tips-and-tricks-at-ellevate-women/
      item.json
    ...
  006-certifications/
    user-experience-the-beginners-guide-from-interaction-design-foundation/
      item.json
      media/
        ...
  007-features/
    logo-featured-on-logosystems-co/
      item.json
    ...
  008-volunteering/
    graphic-designer-at-i-rise/
      item.json
      media/
        ...
  009-contact/
    001-email/
      item.json
    002-linkedin/
      item.json
    ...
  010-projects/
    ...
  011-sideProjects/
    ...
  012-exhibitions/
    ...
  013-writing/
    ...
  case-studies/
    slug1.md
    slug2.md
```

## Ordering Strategy

### Section Ordering
- Section directories use numeric prefixes: `001-general`, `002-workExperience`, `003-education`, etc.
- Order is determined by the numeric prefix in the directory name
- To reorder sections, rename directories (e.g., swap `002-workExperience` and `003-education` to put Education before Work Experience)
- The `sectionOrder` field in `general.json` can be removed or kept for reference (directory order takes precedence)

### Item Ordering Within Sections
- Item directories use numeric prefixes: `001-item-slug`, `002-item-slug`, etc.
- Order is determined by the numeric prefix in the directory name
- To reorder items, rename directories within the section
- Items are sorted by prefix when building collections

## Implementation Plan

### 1. Create Data Loading Utility

Create `app/lib/contentLoader.ts` that:

- Scans `public/content/` directory for section directories (matching pattern `^\d{3}-.*`)
- Sorts section directories by numeric prefix
- Extracts section name from directory name (strips `001-` prefix)
- Reads `001-general/general.json` for general profile data
- For each section directory:
  - Scans for item directories (matching pattern `^\d{3}-.*`)
  - Sorts item directories by numeric prefix
  - Reads each `item.json` file
  - Updates media paths to be relative to item directory
  - Extracts item slug from directory name (for reference, not used in final structure)
- Constructs the same data structure as before for backward compatibility:
  - Individual section arrays (workExperience, education, etc.)
  - `allCollections` array with sections in directory order and items in directory order
- Handles media path resolution (relative to item directory)

### 2. Update Data Reading Points

Update files that read `profileData.json`:

- `app/page.tsx` - use new contentLoader
- `app/layout.tsx` - use new contentLoader  
- `app/[slug]/page.tsx` - use new contentLoader for CV data, update markdown path to `case-studies/`

### 3. Media Path Updates

The contentLoader will:

- Update attachment URLs to be relative to item directories (e.g., `/content/workExperience/001-product-designer-at-instadeep/media/image.png`)
- Update profilePhoto path to `/content/general/media/profilePhoto.jpg`

### 4. Migration Strategy

Create a migration script or manual instructions to:

- Extract general data to `001-general/general.json`
- Move profilePhoto to `001-general/media/profilePhoto.jpg`
- For each section in `sectionOrder`:
  - Create section directory with appropriate numeric prefix (e.g., `002-workExperience`)
  - For each item in the section array:
    - Generate slug from item heading
    - Create item subdirectory with numeric prefix (e.g., `001-product-designer-at-instadeep`)
    - Move item data to `item.json` in its subdirectory
    - Move associated media files to item's `media/` subdirectory
    - Update media paths in `item.json` to be relative (just filename, loader will construct full path)
- Move markdown files to `case-studies/` directory

### 5. Section Mapping

Map directory names to section display names and JSON keys:

- `001-general` → `general/` (not in allCollections, handled separately)
- `002-workExperience` → `workExperience/` (display: "Work Experience")
- `003-education` → `education/` (display: "Education")
- `004-awards` → `awards/` (display: "Awards")
- `005-speaking` → `speaking/` (display: "Speaking", JSON key: `talks`)
- `006-certifications` → `certifications/` (display: "Certifications")
- `007-features` → `features/` (display: "Features")
- `008-volunteering` → `volunteering/` (display: "Volunteering")
- `009-contact` → `contact/` (display: "Contact")
- `010-projects` → `projects/` (display: "Projects")
- `011-sideProjects` → `sideProjects/` (display: "Side Projects")
- `012-exhibitions` → `exhibitions/` (display: "Exhibitions")
- `013-writing` → `writing/` (display: "Writing")

### 6. Slug Generation

Create utility function to generate slugs from item headings:

- Convert to lowercase
- Replace spaces and special characters with hyphens
- Handle edge cases (duplicates, special characters)
- Used for both section and item directory names (after numeric prefix)

### 7. Static Export Compatibility

Ensure the new structure works with Next.js static export:

- All file reads happen at build time (already using `fs` in server components)
- Directory scanning works in static export context
- Media files remain in `public/` so they're served statically
- Numeric prefixes ensure consistent ordering across different filesystems

## Files to Modify

1. **Create**: `app/lib/contentLoader.ts` - main data loading utility
2. **Modify**: `app/page.tsx` - use contentLoader instead of direct JSON read
3. **Modify**: `app/layout.tsx` - use contentLoader instead of direct JSON read
4. **Modify**: `app/[slug]/page.tsx` - use contentLoader and update markdown path to `case-studies/`
5. **Create**: Migration script/instructions for restructuring existing data

## Key Considerations

- Maintain backward compatibility: contentLoader should produce the same data structure
- Handle missing files gracefully (items without media, empty sections, etc.)
- Ensure media paths are correctly resolved for both development and production
- Keep the `allCollections` structure intact for Profile component compatibility
- All operations must work at build time for static export
- Directory order (via numeric prefixes) is the source of truth for ordering
- Section names are extracted from directory names, mapped to display names
- Both section and item ordering are controlled by numeric prefixes in directory names
