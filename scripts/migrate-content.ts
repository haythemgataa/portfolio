import { promises as fs } from 'fs';
import { join } from 'path';

// Section mapping: JSON key -> { directory name, display name, order }
const SECTION_MAP: Record<string, { dirName: string; displayName: string; order: number }> = {
  'workExperience': { dirName: 'workExperience', displayName: 'Work Experience', order: 2 },
  'education': { dirName: 'education', displayName: 'Education', order: 3 },
  'awards': { dirName: 'awards', displayName: 'Awards', order: 4 },
  'talks': { dirName: 'speaking', displayName: 'Speaking', order: 5 },
  'certifications': { dirName: 'certifications', displayName: 'Certifications', order: 6 },
  'features': { dirName: 'features', displayName: 'Features', order: 7 },
  'volunteering': { dirName: 'volunteering', displayName: 'Volunteering', order: 8 },
  'contact': { dirName: 'contact', displayName: 'Contact', order: 9 },
  'projects': { dirName: 'projects', displayName: 'Projects', order: 10 },
  'sideProjects': { dirName: 'sideProjects', displayName: 'Side Projects', order: 11 },
  'exhibitions': { dirName: 'exhibitions', displayName: 'Exhibitions', order: 12 },
  'writing': { dirName: 'writing', displayName: 'Writing', order: 13 },
};

/**
 * Generate a slug from a heading
 */
function generateSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extract filename from a path
 */
function getFilename(path: string): string {
  return path.split('/').pop() || path;
}

/**
 * Migrate the content structure
 */
async function migrate() {
  const contentPath = join(process.cwd(), 'public', 'content');
  const mediaPath = join(contentPath, 'media');
  
  // Read existing profileData.json
  const profileDataPath = join(contentPath, 'profileData.json');
  const profileData = JSON.parse(await fs.readFile(profileDataPath, 'utf8'));
  
  console.log('Starting migration...');
  
  // 1. Create general directory and move general data
  console.log('Creating general directory...');
  const generalDir = join(contentPath, '001-general');
  await fs.mkdir(generalDir, { recursive: true });
  await fs.mkdir(join(generalDir, 'media'), { recursive: true });
  
  // Extract general data
  const generalData = { ...profileData.general };
  
  // Move profilePhoto
  if (generalData.profilePhoto) {
    const photoFilename = getFilename(generalData.profilePhoto);
    const sourcePhoto = join(mediaPath, photoFilename);
    const destPhoto = join(generalDir, 'media', photoFilename);
    
    try {
      await fs.copyFile(sourcePhoto, destPhoto);
      console.log(`  Moved profilePhoto to ${destPhoto}`);
    } catch (error) {
      console.warn(`  Could not move profilePhoto: ${error}`);
    }
  }
  
  // Remove sectionOrder (directory order will be used instead)
  delete generalData.sectionOrder;
  
  // Write general.json
  await fs.writeFile(
    join(generalDir, 'general.json'),
    JSON.stringify(generalData, null, 2)
  );
  console.log('  Created general.json');
  
  // 2. Process each section
  const sectionOrder = profileData.general.sectionOrder || [];
  
  for (const sectionName of sectionOrder) {
    // Find the JSON key for this section
    const sectionEntry = Object.entries(SECTION_MAP).find(
      ([_, info]) => info.displayName === sectionName
    );
    
    if (!sectionEntry) {
      console.warn(`  Unknown section: ${sectionName}, skipping...`);
      continue;
    }
    
    const [jsonKey, sectionInfo] = sectionEntry;
    const items = profileData[jsonKey] || [];
    
    if (items.length === 0) {
      console.log(`  Section ${sectionName} is empty, skipping...`);
      continue;
    }
    
    console.log(`Processing section: ${sectionName} (${items.length} items)...`);
    
    // Create section directory with numeric prefix
    const sectionDirName = `${String(sectionInfo.order).padStart(3, '0')}-${sectionInfo.dirName}`;
    const sectionDir = join(contentPath, sectionDirName);
    await fs.mkdir(sectionDir, { recursive: true });
    
    // Process each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemSlug = generateSlug(item.heading || item.title || `item-${i}`);
      const itemDirName = `${String(i + 1).padStart(3, '0')}-${itemSlug}`;
      const itemDir = join(sectionDir, itemDirName);
      await fs.mkdir(itemDir, { recursive: true });
      await fs.mkdir(join(itemDir, 'media'), { recursive: true });
      
      // Create item.json with updated media paths
      const itemData = { ...item };
      
      if (itemData.attachments && Array.isArray(itemData.attachments)) {
        itemData.attachments = await Promise.all(
          itemData.attachments.map(async (attachment: any) => {
            if (attachment.url) {
              const filename = getFilename(attachment.url);
              // Move media file
              const sourceMedia = join(mediaPath, filename);
              const destMedia = join(itemDir, 'media', filename);
              
              try {
                await fs.copyFile(sourceMedia, destMedia);
                console.log(`    Moved media: ${filename}`);
              } catch (error) {
                console.warn(`    Could not move media ${filename}: ${error}`);
              }
              
              // Store just filename (loader will construct full path)
              return {
                ...attachment,
                url: filename,
              };
            }
            return attachment;
          })
        );
      }
      
      // Write item.json
      await fs.writeFile(
        join(itemDir, 'item.json'),
        JSON.stringify(itemData, null, 2)
      );
      console.log(`  Created item: ${itemDirName}`);
    }
  }
  
  // 3. Move markdown files to case-studies
  console.log('Moving markdown files to case-studies...');
  const caseStudiesDir = join(contentPath, 'case-studies');
  await fs.mkdir(caseStudiesDir, { recursive: true });
  
  const files = await fs.readdir(contentPath);
  const markdownFiles = files.filter(file => file.endsWith('.md'));
  
  for (const file of markdownFiles) {
    const source = join(contentPath, file);
    const dest = join(caseStudiesDir, file);
    await fs.rename(source, dest);
    console.log(`  Moved ${file} to case-studies/`);
  }
  
  console.log('\nMigration completed!');
  console.log('\nNote: The original profileData.json and media/ directory are still present.');
  console.log('You can delete them after verifying the new structure works correctly.');
}

// Run migration
migrate().catch(console.error);
