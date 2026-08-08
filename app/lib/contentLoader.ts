import { promises as fs } from 'fs';
import { join } from 'path';

// Try to dynamically import sharp for image dimensions (optional dependency)
async function getImageDimensions(path: string): Promise<{ width: number; height: number } | null> {
  try {
    // Dynamic import to avoid requiring sharp as a dependency
    const sharp = await import('sharp');
    const metadata = await sharp.default(path).metadata();
    return metadata.width && metadata.height 
      ? { width: metadata.width, height: metadata.height }
      : null;
  } catch {
    // sharp not available or failed to read, return null to use defaults
    return null;
  }
}

// Section mapping: directory name (without prefix) -> { displayName, jsonKey }
const SECTION_MAP: Record<string, { displayName: string; jsonKey: string }> = {
  'general': { displayName: 'General', jsonKey: 'general' },
  'workExperience': { displayName: 'Work Experience', jsonKey: 'workExperience' },
  'education': { displayName: 'Education', jsonKey: 'education' },
  'awards': { displayName: 'Awards', jsonKey: 'awards' },
  'speaking': { displayName: 'Speaking', jsonKey: 'talks' },
  'certifications': { displayName: 'Certifications', jsonKey: 'certifications' },
  'features': { displayName: 'Features', jsonKey: 'features' },
  'volunteering': { displayName: 'Volunteering', jsonKey: 'volunteering' },
  'contact': { displayName: 'Contact', jsonKey: 'contact' },
  'projects': { displayName: 'Projects', jsonKey: 'projects' },
  'sideProjects': { displayName: 'Side Projects', jsonKey: 'sideProjects' },
  'exhibitions': { displayName: 'Exhibitions', jsonKey: 'exhibitions' },
  'writing': { displayName: 'Writing', jsonKey: 'writing' },
};

interface SectionDir {
  prefix: number;
  name: string;
  fullName: string;
}

interface ItemDir {
  prefix: number;
  slug: string;
  fullName: string;
}

/**
 * Extract numeric prefix and name from directory name
 * e.g., "001-general" -> { prefix: 1, name: "general" }
 */
function parseDirectoryName(dirName: string): { prefix: number; name: string } | null {
  const match = dirName.match(/^(\d{3})-(.+)$/);
  if (!match) return null;
  return {
    prefix: parseInt(match[1], 10),
    name: match[2],
  };
}

/**
 * Update media paths in attachments to be relative to item directory
 */
function updateMediaPaths(attachments: any[], sectionDir: string, itemDir: string): any[] {
  if (!attachments || !Array.isArray(attachments)) return [];
  
  return attachments.map(attachment => {
    if (attachment.url) {
      // Extract filename - could be just a filename or a full path
      // If it's already just a filename (no slashes), use it directly
      // Otherwise, extract the filename from the path
      const filename = attachment.url.includes('/') 
        ? attachment.url.split('/').pop() || attachment.url
        : attachment.url;
      // Construct new path relative to item directory
      const newPath = `/content/${sectionDir}/${itemDir}/media/${filename}`;
      return {
        ...attachment,
        url: newPath,
      };
    }
    return attachment;
  });
}

/**
 * Generate a unique ID from directory path
 * e.g., "002-workExperience/001-product-designer-at-instadeep" -> "workExperience-001-product-designer-at-instadeep"
 */
function generateItemId(sectionDir: string, itemDir: string): string {
  // Extract section name (remove prefix)
  const sectionName = sectionDir.replace(/^\d{3}-/, '');
  // Extract item slug (remove prefix)
  const itemSlug = itemDir.replace(/^\d{3}-/, '');
  return `${sectionName}-${itemSlug}`;
}

/**
 * Detect media type from file extension
 */
function getMediaType(filename: string): 'image' | 'video' | null {
  const ext = filename.toLowerCase().split('.').pop();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi'];
  
  if (imageExts.includes(ext || '')) return 'image';
  if (videoExts.includes(ext || '')) return 'video';
  return null;
}

/**
 * Auto-detect attachments from media directory
 */
async function detectAttachments(
  contentPath: string,
  sectionDir: string,
  itemDir: string
): Promise<any[]> {
  const mediaDir = join(contentPath, sectionDir, itemDir, 'media');
  
  try {
    const files = await fs.readdir(mediaDir);
    const attachments: any[] = [];
    
    // Sort files for consistent ordering
    const sortedFiles = files.sort();
    
    for (const filename of sortedFiles) {
      const mediaType = getMediaType(filename);
      if (!mediaType) continue;
      
      const filePath = join(mediaDir, filename);
      const fullUrl = `/content/${sectionDir}/${itemDir}/media/${filename}`;
      
      let width = 1920; // Default dimensions
      let height = 1080;
      
      // Try to get actual dimensions for images
      if (mediaType === 'image') {
        const dimensions = await getImageDimensions(filePath);
        if (dimensions) {
          width = dimensions.width;
          height = dimensions.height;
        }
      }
      
      attachments.push({
        type: mediaType,
        width,
        height,
        url: fullUrl,
      });
    }
    
    return attachments;
  } catch {
    // Media directory doesn't exist or can't be read
    return [];
  }
}

/**
 * Load and parse a single item from its directory
 */
async function loadItem(
  contentPath: string,
  sectionDir: string,
  itemDir: string
): Promise<any> {
  const itemPath = join(contentPath, sectionDir, itemDir, 'item.json');
  let itemData;
  try {
    itemData = JSON.parse(await fs.readFile(itemPath, 'utf8'));
  } catch (error) {
    console.warn(`Failed to load item from ${itemPath}: ${error}`);
    return null;
  }
  
  // Auto-generate ID from directory structure if not present
  if (!itemData.id) {
    itemData.id = generateItemId(sectionDir, itemDir);
  }
  
  // Auto-detect attachments from media directory if not specified
  if (!itemData.attachments || itemData.attachments.length === 0) {
    itemData.attachments = await detectAttachments(contentPath, sectionDir, itemDir);
  } else {
    // Update media paths in manually specified attachments
    itemData.attachments = updateMediaPaths(itemData.attachments, sectionDir, itemDir);
  }
  
  return itemData;
}

/**
 * Load all items from a section directory
 */
async function loadSection(
  contentPath: string,
  sectionDir: SectionDir
): Promise<any[]> {
  const sectionPath = join(contentPath, sectionDir.fullName);
  const entries = await fs.readdir(sectionPath, { withFileTypes: true });
  
  // Find all item directories (matching pattern ^\d{3}-.*)
  const itemDirs: ItemDir[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const parsed = parseDirectoryName(entry.name);
      if (parsed) {
        itemDirs.push({
          prefix: parsed.prefix,
          slug: parsed.name,
          fullName: entry.name,
        });
      }
    }
  }
  
  // Sort by prefix
  itemDirs.sort((a, b) => a.prefix - b.prefix);
  
  // Load all items
  const items = await Promise.all(
    itemDirs.map(itemDir =>
      loadItem(contentPath, sectionDir.fullName, itemDir.fullName)
    )
  );
  
  // Filter out null items (failed to load)
  return items.filter(item => item !== null);
}

/**
 * Load profile data from the new directory structure
 */
export async function loadProfileData(): Promise<any> {
  const contentPath = join(process.cwd(), 'public', 'content');
  
  // Read all entries in content directory
  const entries = await fs.readdir(contentPath, { withFileTypes: true });
  
  // Find section directories (matching pattern ^\d{3}-.*)
  const sectionDirs: SectionDir[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const parsed = parseDirectoryName(entry.name);
      if (parsed && parsed.name !== 'case-studies') {
        sectionDirs.push({
          prefix: parsed.prefix,
          name: parsed.name,
          fullName: entry.name,
        });
      }
    }
  }
  
  // Sort by prefix
  sectionDirs.sort((a, b) => a.prefix - b.prefix);
  
  // Load general data
  const generalDir = sectionDirs.find(s => s.name === 'general');
  if (!generalDir) {
    throw new Error('General directory (001-general) not found');
  }
  
  const generalPath = join(contentPath, generalDir.fullName, 'general.json');
  let generalData;
  try {
    generalData = JSON.parse(await fs.readFile(generalPath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read general.json: ${error}`);
  }
  
  // Update profilePhoto path
  if (generalData.profilePhoto) {
    const filename = generalData.profilePhoto.includes('/')
      ? generalData.profilePhoto.split('/').pop() || 'profilePhoto.jpg'
      : generalData.profilePhoto;
    generalData.profilePhoto = `/content/${generalDir.fullName}/media/${filename}`;
  }
  
  // Load all sections
  const sections: Record<string, any[]> = {};
  const allCollections: any[] = [];
  
  for (const sectionDir of sectionDirs) {
    if (sectionDir.name === 'general') continue;
    
    const sectionInfo = SECTION_MAP[sectionDir.name];
    if (!sectionInfo) {
      console.warn(`Unknown section: ${sectionDir.name}`);
      continue;
    }
    
    const items = await loadSection(contentPath, sectionDir);
    sections[sectionInfo.jsonKey] = items;
    
    // Add to allCollections with display name
    if (items.length > 0) {
      allCollections.push({
        name: sectionInfo.displayName,
        items: items,
      });
    }
  }
  
  // Construct the same structure as the original JSON
  return {
    general: generalData,
    ...sections,
    allCollections: allCollections,
  };
}
