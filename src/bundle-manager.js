/**
 * Bundle Manager - Handles downloading and installing bundled AI assets
 * 
 * Downloads split bundle parts from GitHub Releases and combines them
 * into a complete AI stack (Ollama + Python + PyTorch + SD model)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { app } = require('electron');
const { createWriteStream, createReadStream } = require('fs');
const { pipeline } = require('stream/promises');
const { createGunzip } = require('zlib');

// Compute SHA256 hash of a file
function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Bundle configuration
const BUNDLE_VERSION = '1.0.0';
const BUNDLE_REPO = 'TheFutureForgeCo/Worker';
const BUNDLE_RELEASE_TAG = `bundle-v${BUNDLE_VERSION}`;
const MANIFEST_URL = `https://github.com/${BUNDLE_REPO}/releases/download/${BUNDLE_RELEASE_TAG}/bundle-manifest.json`;

// Get the bundle directory path
function getBundleDir() {
  return path.join(app.getPath('userData'), 'bundled-ai');
}

// Get temp directory for downloads
function getTempDir() {
  return path.join(app.getPath('userData'), 'bundle-temp');
}

// Check if bundle is already installed
function isBundleInstalled() {
  const bundleDir = getBundleDir();
  const infoFile = path.join(bundleDir, 'bundle-info.json');
  
  if (!fs.existsSync(infoFile)) {
    return { installed: false, reason: 'Bundle not found' };
  }
  
  try {
    const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
    
    // Check version
    if (info.version !== BUNDLE_VERSION) {
      return { installed: false, reason: `Version mismatch (have ${info.version}, need ${BUNDLE_VERSION})` };
    }
    
    // Quick check for key components
    const checks = [
      { name: 'Ollama', path: path.join(bundleDir, 'ollama', process.platform === 'win32' ? 'ollama.exe' : 'ollama') },
      { name: 'Python', path: path.join(bundleDir, 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3') },
      { name: 'SD Model', path: path.join(bundleDir, 'models', 'sd-v1-5.safetensors') }
    ];
    
    for (const check of checks) {
      if (!fs.existsSync(check.path)) {
        return { installed: false, reason: `${check.name} not found` };
      }
    }
    
    return { installed: true, version: info.version };
  } catch (err) {
    return { installed: false, reason: `Error reading bundle info: ${err.message}` };
  }
}

// Get bundle paths for use by the main app
function getBundlePaths() {
  const bundleDir = getBundleDir();
  const isWindows = process.platform === 'win32';
  
  return {
    bundleDir,
    ollama: path.join(bundleDir, 'ollama', isWindows ? 'ollama.exe' : 'ollama'),
    ollamaModels: path.join(bundleDir, 'ollama', 'models'),
    python: path.join(bundleDir, 'python', isWindows ? 'python.exe' : 'bin/python3'),
    pythonDir: path.join(bundleDir, 'python'),
    sdModel: path.join(bundleDir, 'models', 'sd-v1-5.safetensors'),
    modelsDir: path.join(bundleDir, 'models')
  };
}

// Fetch JSON from URL
async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const makeRequest = (reqUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }
      
      https.get(reqUrl, { headers: { 'User-Agent': 'ComputeGrid-Worker' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          makeRequest(res.headers.location, redirectCount + 1);
          return;
        }
        
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON'));
          }
        });
      }).on('error', reject);
    };
    
    makeRequest(url);
  });
}

// Download a file with progress callback
async function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    let downloadedBytes = 0;
    let totalBytes = 0;
    
    const makeRequest = (reqUrl, redirectCount = 0) => {
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'));
        return;
      }
      
      https.get(reqUrl, { headers: { 'User-Agent': 'ComputeGrid-Worker' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          makeRequest(res.headers.location, redirectCount + 1);
          return;
        }
        
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (onProgress && totalBytes > 0) {
            onProgress(downloadedBytes, totalBytes, Math.round(downloadedBytes / totalBytes * 100));
          }
        });
        
        res.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve({ downloadedBytes, totalBytes });
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };
    
    makeRequest(url);
  });
}

// Combine split parts into a single file
async function combineParts(partPaths, outputPath, onProgress) {
  const output = createWriteStream(outputPath);
  let processedBytes = 0;
  let totalBytes = 0;
  
  // Calculate total size
  for (const partPath of partPaths) {
    totalBytes += fs.statSync(partPath).size;
  }
  
  for (let i = 0; i < partPaths.length; i++) {
    const partPath = partPaths[i];
    const input = createReadStream(partPath);
    
    await new Promise((resolve, reject) => {
      input.on('data', (chunk) => {
        processedBytes += chunk.length;
        if (onProgress) {
          onProgress(i + 1, partPaths.length, processedBytes, totalBytes);
        }
      });
      
      input.on('end', resolve);
      input.on('error', reject);
      input.pipe(output, { end: false });
    });
  }
  
  output.end();
}

// Extract ZIP archive
async function extractZip(zipPath, destDir) {
  // Use PowerShell on Windows, unzip on Linux/Mac
  const { exec } = require('child_process');
  
  return new Promise((resolve, reject) => {
    let cmd;
    if (process.platform === 'win32') {
      cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`;
    } else {
      cmd = `unzip -o "${zipPath}" -d "${destDir}"`;
    }
    
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Extraction failed: ${stderr || err.message}`));
      } else {
        resolve();
      }
    });
  });
}

// Main bundle installation function
async function installBundle(onProgress, onStatus) {
  const bundleDir = getBundleDir();
  const tempDir = getTempDir();
  
  // Create directories
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  if (!fs.existsSync(bundleDir)) {
    fs.mkdirSync(bundleDir, { recursive: true });
  }
  
  try {
    // Step 1: Fetch manifest
    onStatus && onStatus('Fetching bundle manifest...');
    const manifest = await fetchJson(MANIFEST_URL);
    
    if (!manifest.parts || manifest.parts.length === 0) {
      throw new Error('Invalid manifest: no parts found');
    }
    
    const totalParts = manifest.parts.length;
    const totalSize = manifest.totalSize || 0;
    
    onStatus && onStatus(`Found ${totalParts} bundle parts (${(totalSize / 1024 / 1024 / 1024).toFixed(1)} GB total)`);
    
    // Step 2: Download all parts with integrity verification
    const partPaths = [];
    let downloadedTotal = 0;
    
    for (let i = 0; i < manifest.parts.length; i++) {
      const part = manifest.parts[i];
      const partPath = path.join(tempDir, part.filename);
      partPaths.push(partPath);
      
      // Skip if already downloaded and verified
      if (fs.existsSync(partPath)) {
        const stats = fs.statSync(partPath);
        if (stats.size === part.size) {
          // Verify SHA256 hash if provided
          if (part.sha256) {
            const fileHash = await computeFileSha256(partPath);
            if (fileHash === part.sha256) {
              onStatus && onStatus(`Part ${i + 1}/${totalParts} verified, skipping...`);
              downloadedTotal += part.size;
              continue;
            } else {
              onStatus && onStatus(`Part ${i + 1}/${totalParts} hash mismatch, re-downloading...`);
              fs.unlinkSync(partPath);
            }
          } else {
            onStatus && onStatus(`Part ${i + 1}/${totalParts} already downloaded, skipping...`);
            downloadedTotal += part.size;
            continue;
          }
        }
      }
      
      onStatus && onStatus(`Downloading part ${i + 1}/${totalParts}...`);
      
      const partUrl = `https://github.com/${BUNDLE_REPO}/releases/download/${BUNDLE_RELEASE_TAG}/${part.filename}`;
      
      await downloadFile(partUrl, partPath, (downloaded, total, percent) => {
        const overallProgress = ((downloadedTotal + downloaded) / totalSize) * 100;
        onProgress && onProgress({
          phase: 'download',
          part: i + 1,
          totalParts,
          partProgress: percent,
          overallProgress: Math.round(overallProgress),
          downloadedBytes: downloadedTotal + downloaded,
          totalBytes: totalSize
        });
      });
      
      // Verify downloaded part
      if (part.sha256) {
        onStatus && onStatus(`Verifying part ${i + 1}/${totalParts}...`);
        const fileHash = await computeFileSha256(partPath);
        if (fileHash !== part.sha256) {
          throw new Error(`Integrity check failed for ${part.filename}. Expected ${part.sha256}, got ${fileHash}`);
        }
      }
      
      downloadedTotal += part.size;
    }
    
    // Step 3: Combine parts
    onStatus && onStatus('Combining bundle parts...');
    const combinedPath = path.join(tempDir, 'bundle-complete.zip');
    
    await combineParts(partPaths, combinedPath, (partNum, totalParts, processed, total) => {
      onProgress && onProgress({
        phase: 'combine',
        progress: Math.round(processed / total * 100)
      });
    });
    
    // Step 4: Extract bundle
    onStatus && onStatus('Extracting bundle (this may take a few minutes)...');
    onProgress && onProgress({ phase: 'extract', progress: 0 });
    
    await extractZip(combinedPath, bundleDir);
    
    onProgress && onProgress({ phase: 'extract', progress: 100 });
    
    // Step 5: Cleanup temp files
    onStatus && onStatus('Cleaning up...');
    
    for (const partPath of partPaths) {
      try { fs.unlinkSync(partPath); } catch (e) {}
    }
    try { fs.unlinkSync(combinedPath); } catch (e) {}
    try { fs.rmdirSync(tempDir); } catch (e) {}
    
    // Verify installation
    const checkResult = isBundleInstalled();
    if (!checkResult.installed) {
      throw new Error(`Installation verification failed: ${checkResult.reason}`);
    }
    
    onStatus && onStatus('Bundle installation complete!');
    return { success: true, version: BUNDLE_VERSION };
    
  } catch (err) {
    onStatus && onStatus(`Installation failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// Export functions
module.exports = {
  BUNDLE_VERSION,
  isBundleInstalled,
  getBundlePaths,
  getBundleDir,
  installBundle
};
