import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CAPACITOR_VERSION = '^6.0.0';
const LOCAL_TOOLS_DIR = path.join(__dirname, '.tools');

// ==================== UTILITAIRES ET COULEURS NATIVES ====================

const colors = {
    info: (txt) => `\x1b[34m${txt}\x1b[0m`,
    success: (txt) => `\x1b[32m${txt}\x1b[0m`,
    error: (txt) => `\x1b[31m${txt}\x1b[0m`,
    warning: (txt) => `\x1b[33m${txt}\x1b[0m`,
    step: (txt) => `\x1b[36m${txt}\x1b[0m`,
    cyan: (txt) => `\x1b[36m${txt}\x1b[0m`,
    bold: (txt) => `\x1b[1m${txt}\x1b[0m`,
    boldGreen: (txt) => `\x1b[1m\x1b[32m${txt}\x1b[0m`
};

function log(message, type = 'info') {
    const prefix = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warning: '⚠️',
        step: '🚀'
    };

    const colorFn = colors[type] || ((t) => t);
    console.log(`${prefix[type] || 'ℹ️'} ${colorFn(message)}`);
}

function runCommand(command, args = [], options = {}) {
    const isWin = os.platform() === 'win32';
    // Rediriger stdio vers Pipe si input est fourni pour que Node transmette les réponses
    const stdioOption = options.stdio 
        ? options.stdio 
        : (options.input !== undefined ? ['pipe', 'inherit', 'inherit'] : 'inherit');

    const result = spawnSync(command, args, {
        cwd: options.cwd || __dirname,
        stdio: stdioOption,
        input: options.input,
        env: options.env || process.env,
        shell: isWin
    });

    if (result.error) {
        log(`Erreur lors de l'exécution de ${command}: ${result.error.message}`, 'error');
    }
    return result;
}

// ==================== TÉLÉCHARGEMENT ET EXTRACTION AUTOMATIQUE ====================

async function downloadFile(url, destPath) {
    log(`📥 Téléchargement en cours : ${url}`, 'info');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Échec du téléchargement (${response.status} ${response.statusText})`);
    
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const fileStream = fs.createWriteStream(destPath);
    await pipeline(Readable.fromWeb(response.body), fileStream);
    log(`✅ Téléchargement terminé !`, 'success');
}

function extractArchive(archivePath, targetDir) {
    log(`📦 Extraction de l'archive vers ${targetDir}...`, 'info');
    fs.mkdirSync(targetDir, { recursive: true });
    const platform = os.platform();

    if (archivePath.endsWith('.zip')) {
        if (platform === 'win32') {
            runCommand('powershell', ['-Command', `Expand-Archive -Path "${archivePath}" -DestinationPath "${targetDir}" -Force`]);
        } else {
            runCommand('unzip', ['-q', '-o', archivePath, '-d', targetDir]);
        }
    } else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
        runCommand('tar', ['-xzf', archivePath, '-C', targetDir]);
    }
}

async function installPortableJava() {
    log('☕ Java 21 non trouvé. Installation automatique de OpenJDK 21...', 'step');
    const jdkDir = path.join(LOCAL_TOOLS_DIR, 'jdk');
    const platform = os.platform();
    let downloadUrl = '';
    let archiveName = '';

    if (platform === 'win32') {
        downloadUrl = 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_windows_hotspot_21.0.2_13.zip';
        archiveName = 'jdk21.zip';
    } else if (platform === 'darwin') {
        const arch = os.arch() === 'arm64' ? 'aarch64' : 'x64';
        downloadUrl = `https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_${arch}_mac_hotspot_21.0.2_13.tar.gz`;
        archiveName = 'jdk21.tar.gz';
    } else {
        downloadUrl = 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_linux_hotspot_21.0.2_13.tar.gz';
        archiveName = 'jdk21.tar.gz';
    }

    const archivePath = path.join(LOCAL_TOOLS_DIR, archiveName);
    await downloadFile(downloadUrl, archivePath);
    extractArchive(archivePath, jdkDir);
    fs.unlinkSync(archivePath);

    const subdirs = fs.readdirSync(jdkDir);
    const extractedFolder = subdirs.find(d => fs.statSync(path.join(jdkDir, d)).isDirectory());
    const finalJavaPath = platform === 'darwin' 
        ? path.join(jdkDir, extractedFolder, 'Contents', 'Home')
        : path.join(jdkDir, extractedFolder);

    log(`🎉 OpenJDK 21 installé avec succès dans : ${finalJavaPath}`, 'success');
    return finalJavaPath;
}

function acceptAndEnsureAndroidLicenses(sdkDir) {
    const licensesDir = path.join(sdkDir, 'licenses');
    fs.mkdirSync(licensesDir, { recursive: true });

    const androidSdkLicense = `89330d322230438e14723775e709dd90568b506f\n24333f8a637188280d90814152513c2e6e3a621d\nd56f5187479451eabf01fb78af6dfcb131a6481e`;
    const androidPreviewLicense = `84831b9409646a918e30573bab4c9c91346d8abd`;

    fs.writeFileSync(path.join(licensesDir, 'android-sdk-license'), androidSdkLicense);
    fs.writeFileSync(path.join(licensesDir, 'android-sdk-preview-license'), androidPreviewLicense);
}

async function installPortableAndroidSdk() {
    log('🤖 Android SDK non trouvé ou incomplet. Configuration des outils SDK Android...', 'step');
    const sdkDir = path.join(LOCAL_TOOLS_DIR, 'android-sdk');
    const platform = os.platform();
    let downloadUrl = '';

    if (!fs.existsSync(path.join(sdkDir, 'cmdline-tools', 'latest'))) {
        if (platform === 'win32') {
            downloadUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip';
        } else if (platform === 'darwin') {
            downloadUrl = 'https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip';
        } else {
            downloadUrl = 'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip';
        }

        const archivePath = path.join(LOCAL_TOOLS_DIR, 'cmdline-tools.zip');
        await downloadFile(downloadUrl, archivePath);

        const cmdlineDir = path.join(sdkDir, 'cmdline-tools', 'latest');
        const tempExtract = path.join(LOCAL_TOOLS_DIR, 'temp-cmd');
        extractArchive(archivePath, tempExtract);

        fs.mkdirSync(cmdlineDir, { recursive: true });
        const innerCmd = path.join(tempExtract, 'cmdline-tools');
        
        fs.cpSync(innerCmd, cmdlineDir, { recursive: true });
        fs.rmSync(tempExtract, { recursive: true, force: true });
        fs.unlinkSync(archivePath);
    }

    const isWin = platform === 'win32';
    const sdkManagerBin = path.join(sdkDir, 'cmdline-tools', 'latest', 'bin', isWin ? 'sdkmanager.bat' : 'sdkmanager');

    log('⚙️ Acceptation automatique des licences et téléchargement de Build-Tools & Platforms...', 'info');
    
    const jdkPath = getJavaHomePath();
    const env = { ...process.env, ANDROID_HOME: sdkDir };
    if (jdkPath && jdkPath !== 'SYSTEM_GLOBAL') env.JAVA_HOME = jdkPath;

    acceptAndEnsureAndroidLicenses(sdkDir);

    runCommand(sdkManagerBin, ['--licenses', `--sdk_root=${sdkDir}`], {
        env,
        input: 'y\n'.repeat(50)
    });

    runCommand(sdkManagerBin, ['platform-tools', 'platforms;android-34', 'build-tools;34.0.0', `--sdk_root=${sdkDir}`], { env });

    log(`🎉 SDK Android configuré avec succès dans : ${sdkDir}`, 'success');
    return sdkDir;
}

function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        if (typeof process.loadEnvFile === 'function') {
            try { 
                process.loadEnvFile(envPath); 
                return; 
            } catch (err) {
                log(`Chargement natif .env ignoré (${err.message}). Utilisation du fallback.`, 'warning');
            }
        }
        try {
            const content = fs.readFileSync(envPath, 'utf8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const [k, ...v] = trimmed.split('=');
                    const key = k.trim();
                    let val = v.join('=').trim().replace(/^["']|["']$/g, '');
                    if (!process.env[key]) process.env[key] = val;
                }
            }
        } catch (err) {
            log(`Impossible de lire le fichier .env : ${err.message}`, 'warning');
        }
    }
}
loadEnv();

function getJavaMajorVersion(javaExecutable = 'java') {
    try {
        const isWin = os.platform() === 'win32';
        const res = spawnSync(javaExecutable, ['-version'], { encoding: 'utf8', shell: isWin });
        const output = (res.stdout || '') + (res.stderr || '');
        const match = output.match(/version\s+"(\d+)(?:\.(\d+))?/i);
        if (match) {
            let major = parseInt(match[1], 10);
            if (major === 1 && match[2]) {
                major = parseInt(match[2], 10);
            }
            return major;
        }
    } catch {
        return null;
    }
    return null;
}

function getJavaHomePath() {
    const localJdk = path.join(LOCAL_TOOLS_DIR, 'jdk');
    if (fs.existsSync(localJdk)) {
        const subdirs = fs.readdirSync(localJdk);
        const folder = subdirs.find(d => fs.statSync(path.join(localJdk, d)).isDirectory());
        if (folder) {
            const fullPath = os.platform() === 'darwin'
                ? path.join(localJdk, folder, 'Contents', 'Home')
                : path.join(localJdk, folder);
            if (fs.existsSync(fullPath)) return fullPath;
        }
    }

    const envJavaHome = process.env.JDK_HOME || process.env.JAVA_HOME;
    if (envJavaHome && fs.existsSync(envJavaHome)) {
        const javaBin = path.join(envJavaHome, 'bin', os.platform() === 'win32' ? 'java.exe' : 'java');
        if (fs.existsSync(javaBin)) {
            const version = getJavaMajorVersion(javaBin);
            if (version && version >= 21) {
                return envJavaHome;
            } else if (version) {
                log(`⚠️ JAVA_HOME contient Java ${version}, mais Java 21+ est requis.`, 'warning');
            }
        }
    }

    const systemVersion = getJavaMajorVersion('java');
    if (systemVersion && systemVersion >= 21) {
        return 'SYSTEM_GLOBAL';
    } else if (systemVersion) {
        log(`⚠️ Le 'java' système est en version ${systemVersion}, mais Java 21+ est requis.`, 'warning');
    }

    return null;
}

function getAndroidSdkPath() {
    if (process.env.SDK_HOME && fs.existsSync(process.env.SDK_HOME)) return process.env.SDK_HOME;
    if (process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME)) return process.env.ANDROID_HOME;
    if (process.env.ANDROID_SDK_ROOT && fs.existsSync(process.env.ANDROID_SDK_ROOT)) return process.env.ANDROID_SDK_ROOT;

    const localSdk = path.join(LOCAL_TOOLS_DIR, 'android-sdk');
    if (fs.existsSync(localSdk)) return localSdk;

    let defaultPath = '';
    if (os.platform() === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        defaultPath = path.join(localAppData, 'Android', 'Sdk');
    } else if (os.platform() === 'darwin') {
        defaultPath = path.join(os.homedir(), 'Library', 'Android', 'sdk');
    } else {
        defaultPath = path.join(os.homedir(), 'Android', 'Sdk');
    }

    if (fs.existsSync(defaultPath)) return defaultPath;
    return null;
}

const CONFIG = {
    methods: {
        CAPACITOR: 'capacitor',
        GRADLE_ONLY: 'gradle-only'
    },
    platforms: {
        ANDROID: 'android',
        IOS: 'ios',
        BOTH: 'both'
    },
    get androidSDK() {
        return {
            jdkDir: getJavaHomePath(),
            androidHome: getAndroidSdkPath()
        };
    },
    appId: process.env.APP_ID || 'com.simulquest.app',
    appName: process.env.APP_NAME || 'Simul Quest',
    buildType: process.env.BUILD_TYPE || 'debug',
    cleanBuild: process.env.CLEAN_BUILD === 'true',
    skipTests: process.env.SKIP_TESTS === 'true',
    fullscreen: process.env.FULLSCREEN === 'true',
    framework: process.env.FRAMEWORK || 'vanilla',
    defaultMethod: process.env.DEFAULT_METHOD || 'capacitor',
    defaultPlatform: process.env.DEFAULT_PLATFORM || 'android'
};

const AVAILABLE_MODULES = [
    { id: '1', name: '📸 Caméra (Photo/Galerie)', packages: [{ name: '@capacitor/camera', version: CAPACITOR_VERSION }], key: 'camera', androidPermissions: ['<uses-permission android:name="android.permission.CAMERA" />', '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />', '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />'] },
    { id: '2', name: '🔍 Scanner QR Code / Code-barres', packages: [{ name: '@capacitor-mlkit/barcode-scanning', version: CAPACITOR_VERSION }], key: 'qrcode', androidPermissions: ['<uses-permission android:name="android.permission.CAMERA" />'] },
    { id: '3', name: '🎙️ Micro & Enregistreur Audio', packages: [{ name: 'capacitor-voice-recorder', version: CAPACITOR_VERSION }, { name: '@capacitor/filesystem', version: CAPACITOR_VERSION }], key: 'microphone', androidPermissions: ['<uses-permission android:name="android.permission.RECORD_AUDIO" />', '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />', '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />', '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />'] },
    { id: '4', name: '📍 Géolocalisation (GPS)', packages: [{ name: '@capacitor/geolocation', version: CAPACITOR_VERSION }], key: 'geolocation', androidPermissions: ['<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />', '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />', '<uses-feature android:name="android.hardware.location.gps" android:required="false" />'] },
    { id: '5', name: '🔔 Notifications Locales', packages: [{ name: '@capacitor/local-notifications', version: CAPACITOR_VERSION }], key: 'notifications', androidPermissions: ['<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'] },
    { id: '6', name: '💾 Stockage Local (Preferences)', packages: [{ name: '@capacitor/preferences', version: CAPACITOR_VERSION }], key: 'storage' },
    { id: '7', name: '🌐 État Réseau & Appareil', packages: [{ name: '@capacitor/network', version: CAPACITOR_VERSION }, { name: '@capacitor/device', version: CAPACITOR_VERSION }], key: 'device' },
    { id: '8', name: '🌐 Navigateur In-App', packages: [{ name: '@capacitor/browser', version: CAPACITOR_VERSION }], key: 'browser' },
    { id: '9', name: '📤 Partage Natif', packages: [{ name: '@capacitor/share', version: CAPACITOR_VERSION }], key: 'share' },
    { id: '10', name: '📋 Presse-papier', packages: [{ name: '@capacitor/clipboard', version: CAPACITOR_VERSION }], key: 'clipboard' },
    { id: '11', name: '📳 Retours Haptiques', packages: [{ name: '@capacitor/haptics', version: CAPACITOR_VERSION }], key: 'haptics', androidPermissions: ['<uses-permission android:name="android.permission.VIBRATE" />'] },
    { id: '12', name: '💬 Boîtes de dialogue', packages: [{ name: '@capacitor/dialog', version: CAPACITOR_VERSION }], key: 'dialog' },
    { id: '13', name: '🔄 Orientation Écran', packages: [{ name: '@capacitor/screen-orientation', version: CAPACITOR_VERSION }], key: 'orientation' },
    { id: '14', name: '🎨 Status Bar & Splash Screen', packages: [{ name: '@capacitor/status-bar', version: CAPACITOR_VERSION }, { name: '@capacitor/splash-screen', version: CAPACITOR_VERSION }], key: 'splash' },
    { id: '15', name: '💡 Keep Awake (Écran Allumé)', packages: [{ name: '@capacitor-community/keep-awake', version: CAPACITOR_VERSION }], key: 'keepawake' },
    { id: '16', name: '🔐 Authentification Biométrique (Empreinte / FaceID)', packages: [{ name: '@capgo/capacitor-native-biometric', version: CAPACITOR_VERSION }], key: 'biometrics', androidPermissions: ['<uses-permission android:name="android.permission.USE_BIOMETRIC" />'] },
    { id: '17', name: '📁 Sélecteur & Upload de Fichiers (Tous formats)', packages: [{ name: '@capawesome/capacitor-file-picker', version: CAPACITOR_VERSION }], key: 'filepicker', androidPermissions: ['<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />'] }
];

async function askQuestion(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

function detectInstalledModules() {
    const pkgPath = path.join(__dirname, 'package.json');
    if (!fs.existsSync(pkgPath)) return [];
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = pkg.dependencies || {};
        return AVAILABLE_MODULES.filter(mod => mod.packages.some(p => deps[p.name]));
    } catch {
        return [];
    }
}

// ==================== CONFIGURATEUR VITE MULTI-PAGE ====================

function ensureViteMultiPageConfig(framework = CONFIG.framework || 'vanilla') {
    const viteConfigPath = path.join(__dirname, 'vite.config.js');

    let viteConfig = `import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getHtmlEntries(dir = path.join(__dirname, 'src'), baseDir = path.join(__dirname, 'src')) {
  let entries = {};
  if (!fs.existsSync(dir)) return entries;

  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      Object.assign(entries, getHtmlEntries(fullPath, baseDir));
    } else if (file.name.endsWith('.html')) {
      const relativeKey = path.relative(baseDir, fullPath).split(path.sep).join('/').replace(/\\.html$/, '');
      entries[relativeKey] = fullPath;
    }
  }
  return entries;
}

`;

    if (framework === 'react') {
        viteConfig += `import react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()], root: './src', build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: getHtmlEntries() } } });`;
    } else if (framework === 'vue') {
        viteConfig += `import vue from '@vitejs/plugin-vue';\n\nexport default defineConfig({ plugins: [vue()], root: './src', build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: getHtmlEntries() } } });`;
    } else {
        viteConfig += `export default defineConfig({ root: './src', build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: getHtmlEntries() } } });`;
    }

    fs.writeFileSync(viteConfigPath, viteConfig, 'utf8');
    log('⚙️ Configuration vite.config.js synchronisée (Multi-Pages activé)', 'info');
}

function syncAndroidManifestPermissions(selectedModules) {
    const manifestPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    if (!fs.existsSync(manifestPath)) return;

    let manifestContent = fs.readFileSync(manifestPath, 'utf8');

    const permissionsToKeep = new Set();
    selectedModules.forEach(mod => {
        if (mod.androidPermissions) {
            mod.androidPermissions.forEach(perm => permissionsToKeep.add(perm.trim()));
        }
    });

    const allPossiblePermissions = new Set();
    AVAILABLE_MODULES.forEach(mod => {
        if (mod.androidPermissions) {
            mod.androidPermissions.forEach(perm => allPossiblePermissions.add(perm.trim()));
        }
    });

    let lines = manifestContent.split('\n');
    let modified = false;

    lines = lines.filter(line => {
        const trimmed = line.trim();
        for (const perm of allPossiblePermissions) {
            if (!permissionsToKeep.has(perm) && trimmed === perm) {
                modified = true;
                return false; 
            }
        }
        return true;
    });

    manifestContent = lines.join('\n');

    permissionsToKeep.forEach(perm => {
        if (!manifestContent.includes(perm)) {
            if (manifestContent.includes('<application')) {
                manifestContent = manifestContent.replace('<application', `    ${perm}\n    <application`);
                modified = true;
            }
        }
    });

    if (modified) {
        fs.writeFileSync(manifestPath, manifestContent, 'utf8');
        log('🔧 Permissions natives synchronisées dans AndroidManifest.xml !', 'success');
    }
}

function syncFullscreenState() {
    const stylesPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');
    if (fs.existsSync(stylesPath)) {
        let content = fs.readFileSync(stylesPath, 'utf8');
        content = content.replace(/\s*<item name="android:windowFullscreen">true<\/item>/g, '');
        if (CONFIG.fullscreen) {
            if (content.includes('name="AppTheme.NoActionBar"')) {
                content = content.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, '$1\n        <item name="android:windowFullscreen">true</item>');
            } else if (content.includes('</style>')) {
                content = content.replace('</style>', '    <item name="android:windowFullscreen">true</item>\n    </style>');
            }
            fs.writeFileSync(stylesPath, content, 'utf8');
            log('📱 Mode Fullscreen synchronisé pour Android', 'info');
        } else {
            fs.writeFileSync(stylesPath, content, 'utf8');
        }
    }
    
    const plistPath = path.join(__dirname, 'ios', 'App', 'App', 'Info.plist');
    if (fs.existsSync(plistPath)) {
        let content = fs.readFileSync(plistPath, 'utf8');
        content = content.replace(/\s*<key>UIStatusBarHidden<\/key>\s*<true\/>/g, '');
        content = content.replace(/\s*<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<false\/>/g, '');
        if (CONFIG.fullscreen) {
            content = content.replace('</dict>\n</plist>', '\t<key>UIStatusBarHidden</key>\n\t<true/>\n\t<key>UIViewControllerBasedStatusBarAppearance</key>\n\t<false/>\n</dict>\n</plist>');
            fs.writeFileSync(plistPath, content, 'utf8');
            log('🍎 Mode Fullscreen synchronisé pour iOS', 'info');
        } else {
            fs.writeFileSync(plistPath, content, 'utf8');
        }
    }
}

function cleanupUnusedDemoFiles(srcDir, selectedModules) {
    const selectedKeys = selectedModules.map(m => m.key);
    AVAILABLE_MODULES.forEach(mod => {
        if (!selectedKeys.includes(mod.key)) {
            const htmlFile = path.join(srcDir, `index_${mod.key}_build.html`);
            const jsFile = path.join(srcDir, `script_${mod.key}_build.js`);
            if (fs.existsSync(htmlFile)) { 
                fs.unlinkSync(htmlFile); 
                log(`🗑️ Nettoyage : Suppression de index_${mod.key}_build.html`, 'warning'); 
            }
            if (fs.existsSync(jsFile)) { 
                fs.unlinkSync(jsFile); 
            }
        }
    });
}

// ==================== GESTION DES MODULES ====================

async function manageModulesInteractive() {
    log('==================================================', 'step');
    log('⚙️ GESTION DYNAMIQUE DES PLUGINS / MODULES ⚙️', 'step');
    log('==================================================\n', 'step');

    const currentlyInstalled = detectInstalledModules();
    const installedIds = currentlyInstalled.map(m => m.id);

    console.log('Liste des modules disponibles ( [✓] = Déjà installé ) :\n');
    AVAILABLE_MODULES.forEach(m => {
        const isInstalled = installedIds.includes(m.id);
        const status = isInstalled ? colors.boldGreen('[✓ INSTALLÉ]') : ' ';
        console.log(`  ${colors.cyan(m.id.padStart(2))}. ${m.name} ${status}`);
    });

    console.log(`\n  ${colors.cyan('A')}. Tout installer`);
    console.log(`  ${colors.cyan('N')}. Tout supprimer`);
    console.log(`  ${colors.cyan('Astuce')}: Vous pouvez utiliser '+' ou '-' (ex: '-1' pour retirer la Caméra, '+16' pour la Biométrie)`);

    const choices = await askQuestion('\nEntrez les numéros (ex: 1,2,16,17), commandes (+16, -1), A/N ou Entrée : ');

    let selectedModules = [];
    const rawChoice = choices.trim();
    const choiceUpper = rawChoice.toUpperCase();

    if (choiceUpper === 'A') {
        selectedModules = AVAILABLE_MODULES;
    } else if (choiceUpper === 'N') {
        selectedModules = [];
    } else if (rawChoice.includes('+') || rawChoice.includes('-')) {
        let currentSet = new Set(installedIds);
        const tokens = rawChoice.split(',').map(s => s.trim()).filter(Boolean);

        tokens.forEach(token => {
            if (token.startsWith('+')) {
                currentSet.add(token.substring(1).trim());
            } else if (token.startsWith('-')) {
                currentSet.delete(token.substring(1).trim());
            } else {
                currentSet.add(token);
            }
        });

        selectedModules = AVAILABLE_MODULES.filter(m => currentSet.has(m.id));
    } else if (rawChoice !== '') {
        const ids = rawChoice.split(',').map(s => s.trim());
        selectedModules = AVAILABLE_MODULES.filter(m => ids.includes(m.id));
    } else {
        selectedModules = currentlyInstalled;
    }

    log('\nMise à jour de package.json...', 'info');

    const pkgPath = path.join(__dirname, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.dependencies = pkg.dependencies || {};

    const allModulePackageNames = new Set();
    AVAILABLE_MODULES.forEach(m => m.packages.forEach(p => allModulePackageNames.add(p.name)));

    const baseDeps = {
        "@capacitor/core": pkg.dependencies["@capacitor/core"] || CAPACITOR_VERSION,
        "@capacitor/android": pkg.dependencies["@capacitor/android"] || CAPACITOR_VERSION,
        "@capacitor/ios": pkg.dependencies["@capacitor/ios"] || CAPACITOR_VERSION
    };

    for (const [depName, depVer] of Object.entries(pkg.dependencies)) {
        if (!allModulePackageNames.has(depName) && !depName.startsWith('@capacitor/')) {
            baseDeps[depName] = depVer;
        }
    }

    selectedModules.forEach(mod => {
        mod.packages.forEach(p => { baseDeps[p.name] = p.version; });
    });

    pkg.dependencies = baseDeps;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    log('📦 Installation NPM (npm install)...', 'step');
    runCommand('npm', ['install', '--legacy-peer-deps']);
    
    try {
        runCommand('npm', ['prune']);
    } catch (error) {
        log(`Erreur Prune : ${error.message}`, 'warning');
    }

    const srcDir = path.join(__dirname, 'src');
    cleanupUnusedDemoFiles(srcDir, selectedModules);
    generateDemoFiles(srcDir, CONFIG.appName, selectedModules);

    ensureViteMultiPageConfig(CONFIG.framework);

    log('🔨 Build des assets web...', 'info');
    runCommand('npm', ['run', 'build']);

    if (fs.existsSync(path.join(__dirname, 'android'))) {
        syncAndroidManifestPermissions(selectedModules);
        syncFullscreenState();
        runCommand('npx', ['cap', 'sync', 'android']);
    }

    log('\n🎉 Modules mis à jour avec succès !', 'success');
}

// ==================== GENERATEUR DE PROJET AUTOMATIQUE ====================

async function createNewProject() {
    log('==================================================', 'step');
    log('✨ CRÉATION D\'UN NOUVEAU PROJET AUTOMATIQUE ✨', 'step');
    log('==================================================\n', 'step');

    loadEnv();

    const appNameInput = await askQuestion(`Nom de l'application [${CONFIG.appName}]: `);
    const appName = appNameInput.trim() || CONFIG.appName;

    const defaultSlug = appName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'myapp';
    const defaultAppId = process.env.APP_ID || `com.simulquest.${defaultSlug}`;

    const appIdInput = await askQuestion(`ID de Package [${defaultAppId}]: `);
    const appId = appIdInput.trim() || defaultAppId;

    const fullscreenInput = await askQuestion(`Activer le mode Plein Écran ? (o/N) : `);
    const isFullscreen = fullscreenInput.trim().toLowerCase() === 'o';

    console.log('\n📦 Choisissez les modules à inclure :');
    AVAILABLE_MODULES.forEach(m => console.log(`  ${colors.cyan(m.id.padStart(2))}. ${m.name}`));
    console.log(`  ${colors.cyan('A')}. Tout inclure`);
    console.log(`  ${colors.cyan('N')}. Aucun`);
    const moduleChoices = await askQuestion('\nChoix (ex: 1,2,16,17) ou A/N : ');

    console.log('\n⚛️ Choisissez le Framework / Technologie de base :');
    console.log(`  ${colors.cyan('1')}. Vanilla JS (Standard HTML/JS)`);
    console.log(`  ${colors.cyan('2')}. React`);
    console.log(`  ${colors.cyan('3')}. Vue.js`);
    const frameworkChoice = await askQuestion('\nChoix (1-3) [1] : ');
    
    let framework = 'vanilla';
    if (frameworkChoice.trim() === '2') framework = 'react';
    if (frameworkChoice.trim() === '3') framework = 'vue';

    let selectedModules = [];
    const choiceUpper = moduleChoices.trim().toUpperCase();
    if (choiceUpper === 'A') {
        selectedModules = AVAILABLE_MODULES;
    } else if (choiceUpper !== 'N' && choiceUpper !== '') {
        const ids = moduleChoices.split(',').map(s => s.trim());
        selectedModules = AVAILABLE_MODULES.filter(m => ids.includes(m.id));
    }

    log(`\nCréation du projet "${appName}" avec ${framework.toUpperCase()}...`, 'info');

    const dependencies = {
        "@capacitor/core": CAPACITOR_VERSION,
        "@capacitor/android": CAPACITOR_VERSION,
        "@capacitor/ios": CAPACITOR_VERSION
    };
    
    const devDependencies = {
        "@capacitor/cli": CAPACITOR_VERSION,
        "vite": "^5.0.0"
    };

    if (framework === 'react') {
        dependencies['react'] = '^18.2.0';
        dependencies['react-dom'] = '^18.2.0';
        devDependencies['@vitejs/plugin-react'] = '^4.2.0';
    } else if (framework === 'vue') {
        dependencies['vue'] = '^3.4.0';
        devDependencies['@vitejs/plugin-vue'] = '^5.0.0';
    }

    selectedModules.forEach(mod => {
        mod.packages.forEach(pkg => { dependencies[pkg.name] = pkg.version; });
    });

    const packageJson = {
        name: defaultSlug,
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: { "dev": "vite", "build": "vite build", "preview": "vite preview" },
        dependencies,
        devDependencies
    };

    fs.writeFileSync(path.join(__dirname, 'package.json'), JSON.stringify(packageJson, null, 2));

    ensureViteMultiPageConfig(framework);

    const capConfig = { appId, appName, webDir: "dist", server: { androidScheme: "https" } };
    fs.writeFileSync(path.join(__dirname, 'capacitor.config.json'), JSON.stringify(capConfig, null, 2));

    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        const envContent = `# === CONFIG ===\nBUILD_TYPE=debug\nCLEAN_BUILD=false\nSKIP_TESTS=true\nFULLSCREEN=${isFullscreen}\nAPP_ID=${appId}\nAPP_NAME="${appName}"\nFRAMEWORK=${framework}\nDEFAULT_METHOD=capacitor\nDEFAULT_PLATFORM=android\n# KEYSTORE_PATH=my-release-key.jks\n# KEYSTORE_ALIAS=my-alias\n# KEYSTORE_PASSWORD=my-password\n`;
        fs.writeFileSync(envPath, envContent);
    }

    CONFIG.appId = appId;
    CONFIG.appName = appName;
    CONFIG.fullscreen = isFullscreen;
    CONFIG.framework = framework;

    const srcDir = path.join(__dirname, 'src');
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });

    generateFrameworkBoilerplate(srcDir, appName, framework, selectedModules);
    generateDemoFiles(srcDir, appName, selectedModules);

    log('📦 Installation des dépendances NPM...', 'step');
    runCommand('npm', ['install', '--legacy-peer-deps']);

    log('🔨 Build des ressources Web...', 'info');
    runCommand('npm', ['run', 'build']);

    try {
        runCommand('npx', ['cap', 'add', 'android']);
        syncAndroidManifestPermissions(selectedModules);
        syncFullscreenState();
    } catch (e) {
        log(`Ajout Android : ${e.message}`, 'warning');
    }

    log('\n🎉 Projet initialisé avec succès !', 'success');
}

// ==================== GENERATION DE CODE (SNIPPETS) ====================

function getModuleSnippets(appName) {
    return {
        camera: { html: `<h3>📸 Caméra</h3><button id="btn-camera">Prendre Photo</button><img id="photo-preview" src="" style="display:none;width:100%;margin-top:10px;border-radius:8px;" />`, jsImport: `import { Camera, CameraResultType } from '@capacitor/camera';\n`, jsCode: `document.getElementById('btn-camera')?.addEventListener('click', async () => { const img = await Camera.getPhoto({ quality: 90, resultType: CameraResultType.Uri }); document.getElementById('photo-preview').src = img.webPath; document.getElementById('photo-preview').style.display = 'block'; });\n` },
        qrcode: { html: `<h3>🔍 QR Code</h3><button id="btn-qrcode">Scanner</button><p id="qr-result"></p>`, jsImport: `import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';\n`, jsCode: `document.getElementById('btn-qrcode')?.addEventListener('click', async () => { await BarcodeScanner.requestPermissions(); const { barcodes } = await BarcodeScanner.scan(); if(barcodes.length > 0) document.getElementById('qr-result').innerText = "Scanné: " + barcodes[0].rawValue; });\n` },
        microphone: { html: `<h3>🎙️ Enregistreur</h3><button id="btn-mic-start">Démarrer</button><button id="btn-mic-stop" disabled>Arrêter</button><p id="mic-status"></p>`, jsImport: `import { VoiceRecorder } from 'capacitor-voice-recorder';\n`, jsCode: `const btnStart=document.getElementById('btn-mic-start');const btnStop=document.getElementById('btn-mic-stop');const micStatus=document.getElementById('mic-status');btnStart?.addEventListener('click',async()=>{try{await VoiceRecorder.requestAudioRecordingPermission();await VoiceRecorder.startRecording();btnStart.disabled=true;btnStop.disabled=false;if(micStatus)micStatus.innerText="Enregistrement...";}catch(e){if(micStatus)micStatus.innerText="Erreur: "+e.message;}});btnStop?.addEventListener('click',async()=>{try{const result=await VoiceRecorder.stopRecording();btnStart.disabled=false;btnStop.disabled=true;const duration=(result.value&&result.value.msDuration)?result.value.msDuration:(result.msDuration||"succès");if(micStatus)micStatus.innerText="Enregistré! Durée: "+duration+" ms";}catch(e){if(micStatus)micStatus.innerText="Erreur: "+e.message;}});\n` },
        geolocation: { html: `<h3>📍 Géolocalisation</h3><button id="btn-geo">Obtenir la Position</button><p id="geo-result"></p>`, jsImport: `import { Geolocation } from '@capacitor/geolocation';\n`, jsCode: `document.getElementById('btn-geo')?.addEventListener('click', async () => { const geoStatus = document.getElementById('geo-result'); try { if (geoStatus) geoStatus.innerText = "Recherche..."; await Geolocation.requestPermissions(); const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 }); if (geoStatus) geoStatus.innerText = \`Lat: \${pos.coords.latitude.toFixed(5)}, Lon: \${pos.coords.longitude.toFixed(5)}\`; } catch(e) { if (geoStatus) geoStatus.innerText = "Erreur GPS"; } });\n` },
        notifications: { html: `<h3>🔔 Notifications</h3><button id="btn-notify">Envoyer Test</button>`, jsImport: `import { LocalNotifications } from '@capacitor/local-notifications';\n`, jsCode: `document.getElementById('btn-notify')?.addEventListener('click', async () => { await LocalNotifications.requestPermissions(); await LocalNotifications.schedule({ notifications: [{ title: "${appName}", body: "Test !", id: 1 }] }); });\n` },
        storage: { html: `<h3>💾 Stockage Local</h3><input type="text" id="storage-input" placeholder="Valeur..." /><button id="btn-save">Sauvegarder</button><button id="btn-load">Charger</button><p id="storage-result"></p>`, jsImport: `import { Preferences } from '@capacitor/preferences';\n`, jsCode: `document.getElementById('btn-save')?.addEventListener('click', async () => { const val = document.getElementById('storage-input').value; await Preferences.set({ key: 'user_data', value: val }); document.getElementById('storage-result').innerText = "Sauvegardé !"; }); document.getElementById('btn-load')?.addEventListener('click', async () => { const { value } = await Preferences.get({ key: 'user_data' }); document.getElementById('storage-result').innerText = "Valeur: " + (value || 'Vide'); });\n` },
        device: { html: `<h3>🌐 Appareil</h3><button id="btn-device">Infos</button><p id="device-result"></p>`, jsImport: `import { Device } from '@capacitor/device';\nimport { Network } from '@capacitor/network';\n`, jsCode: `document.getElementById('btn-device')?.addEventListener('click', async () => { const info = await Device.getInfo(); const status = await Network.getStatus(); document.getElementById('device-result').innerText = \`OS: \${info.operatingSystem} \${info.osVersion} | Réseau: \${status.connectionType}\`; });\n` },
        browser: { html: `<h3>🌐 In-App Browser</h3><button id="btn-browser">Ouvrir</button>`, jsImport: `import { Browser } from '@capacitor/browser';\n`, jsCode: `document.getElementById('btn-browser')?.addEventListener('click', async () => { await Browser.open({ url: 'https://google.com' }); });\n` },
        share: { html: `<h3>📤 Partage</h3><button id="btn-share">Partager</button>`, jsImport: `import { Share } from '@capacitor/share';\n`, jsCode: `document.getElementById('btn-share')?.addEventListener('click', async () => { await Share.share({ title: '${appName}', text: 'Test', url: 'https://simulquest.com' }); });\n` },
        clipboard: { html: `<h3>📋 Presse-papier</h3><button id="btn-copy">Copier</button><button id="btn-paste">Coller</button><p id="clip-result"></p>`, jsImport: `import { Clipboard } from '@capacitor/clipboard';\n`, jsCode: `document.getElementById('btn-copy')?.addEventListener('click', async () => { await Clipboard.write({ string: "Copié !" }); document.getElementById('clip-result').innerText = "Copié !"; }); document.getElementById('btn-paste')?.addEventListener('click', async () => { const { value } = await Clipboard.read(); document.getElementById('clip-result').innerText = "Collé: " + value; });\n` },
        haptics: { html: `<h3>📳 Haptiques</h3><button id="btn-vibrate">Vibrer</button>`, jsImport: `import { Haptics, ImpactStyle } from '@capacitor/haptics';\n`, jsCode: `document.getElementById('btn-vibrate')?.addEventListener('click', async () => { try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch(e) { if (navigator.vibrate) navigator.vibrate(200); } });\n` },
        dialog: { html: `<h3>💬 Dialog</h3><button id="btn-dialog">Alerte</button>`, jsImport: `import { Dialog } from '@capacitor/dialog';\n`, jsCode: `document.getElementById('btn-dialog')?.addEventListener('click', async () => { await Dialog.alert({ title: '${appName}', message: 'Dialogue native !' }); });\n` },
        orientation: { html: `<h3>🔄 Orientation</h3><button id="btn-orient">Info</button><p id="orient-result"></p>`, jsImport: `import { ScreenOrientation } from '@capacitor/screen-orientation';\n`, jsCode: `document.getElementById('btn-orient')?.addEventListener('click', async () => { const { type } = await ScreenOrientation.orientation(); document.getElementById('orient-result').innerText = "Orientation: " + type; });\n` },
        keepawake: { html: `<h3>💡 Keep Awake</h3><button id="btn-keepawake">Maintien Écran</button>`, jsImport: `import { KeepAwake } from '@capacitor-community/keep-awake';\n`, jsCode: `document.getElementById('btn-keepawake')?.addEventListener('click', async () => { await KeepAwake.keepAwake(); alert('Écran verrouillé allumé !'); });\n` },
        biometrics: { html: `<h3>🔐 Authentification Biométrique</h3><button id="btn-biometrics">Se connecter avec Empreinte / FaceID</button><p id="bio-result"></p>`, jsImport: `import { NativeBiometric } from '@capgo/capacitor-native-biometric';\n`, jsCode: `document.getElementById('btn-biometrics')?.addEventListener('click', async () => { const bioRes = document.getElementById('bio-result'); try { const result = await NativeBiometric.isAvailable(); if (result.isAvailable) { await NativeBiometric.verifyIdentity({ reason: "Connexion sécurisée", title: "Authentification Biométrique" }); if (bioRes) bioRes.innerText = "✅ Connexion réussie !"; } else { if (bioRes) bioRes.innerText = "❌ Biométrie non disponible sur cet appareil"; } } catch(e) { if (bioRes) bioRes.innerText = "Échec : " + e.message; } });\n` },
        filepicker: { html: `<h3>📁 Sélecteur de Fichiers (Tous Formats)</h3><button id="btn-filepicker">Choisir un Fichier</button><p id="file-result"></p>`, jsImport: `import { FilePicker } from '@capawesome/capacitor-file-picker';\n`, jsCode: `document.getElementById('btn-filepicker')?.addEventListener('click', async () => { const fileRes = document.getElementById('file-result'); try { const result = await FilePicker.pickFiles({ types: ['*/*'], multiple: false }); if (result.files && result.files.length > 0) { const file = result.files[0]; if (fileRes) fileRes.innerText = \`Fichier sélectionné: \${file.name} (\${file.size} octets)\`; } } catch(e) { if (fileRes) fileRes.innerText = "Erreur: " + e.message; } });\n` }
    };
}

function generateDemoFiles(srcDir, appName, modules) {
    const snippets = getModuleSnippets(appName);
    modules.forEach(mod => {
        const snippet = snippets[mod.key];
        if (!snippet) return;
        
        const html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Demo ${mod.name}</title>
    <style>
        body { font-family: sans-serif; padding: 20px; line-height: 1.5; }
        button { margin: 5px; padding: 10px 15px; font-size: 1rem; border-radius: 6px; cursor: pointer; }
        input { margin: 5px; padding: 10px; font-size: 1rem; }
        .back-btn { display: inline-block; margin-bottom: 15px; color: #4f46e5; text-decoration: none; font-weight: bold; }
    </style>
</head>
<body>
    <a href="index.html" class="back-btn">⬅️ Retour à l'accueil</a>
    <h1>Demo: ${mod.name}</h1>
    ${snippet.html}
    <script type="module" src="./script_${mod.key}_build.js"></script>
</body>
</html>`;

        const js = `${snippet.jsImport}\ndocument.addEventListener("DOMContentLoaded", () => {\n${snippet.jsCode}\n});`;
        fs.writeFileSync(path.join(srcDir, `index_${mod.key}_build.html`), html);
        fs.writeFileSync(path.join(srcDir, `script_${mod.key}_build.js`), js);
    });
}

function generateFrameworkBoilerplate(srcDir, appName, framework, modules) {
    const css = `:root { --primary: #4f46e5; --bg: #f8fafc; --text: #0f172a; } * { box-sizing: border-box; font-family: sans-serif; } body { background: var(--bg); color: var(--text); padding: 20px; text-align: center; } h1 { color: var(--primary); } .file-list { margin-top: 20px; } .file-list a { display: inline-block; margin: 6px 0; color: var(--primary); text-decoration: none; font-weight: bold; font-size: 1.1rem; }`;
    fs.writeFileSync(path.join(srcDir, 'style.css'), css);

    let splashCode = '';
    if (CONFIG.fullscreen && modules.some(m => m.key === 'splash')) {
        splashCode = `import('@capacitor/status-bar').then(({ StatusBar }) => StatusBar.hide().catch(() => {})).catch(() => {});\n`;
    }

    if (framework === 'react') {
        fs.writeFileSync(path.join(srcDir, 'index.html'), `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" /><title>${appName}</title></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>`);
        fs.writeFileSync(path.join(srcDir, 'main.jsx'), `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.jsx';\nimport './style.css';\n\n${splashCode}\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>,\n);\n`);
        
        const reactAppContent = `import React from 'react';

const testFiles = import.meta.glob('./*.html', { eager: true });
const files = Object.keys(testFiles).filter((path) => path !== './index.html');

function App() {
  return (
    <div>
      <h1>🚀 ${appName} (React)</h1>
      <p>Bienvenue dans votre application Capacitor + React !</p>
      <div className="file-list">
        <h3>Pages de démonstration disponibles :</h3>
        {files.length === 0 ? (
          <p>Aucune page de test n’a été trouvée.</p>
        ) : (
          files.map((file) => {
            const pageUrl = file.replace('./', '');
            const label = pageUrl.replace('index_', '').replace('_build.html', '').toUpperCase();
            return (
              <div key={file}>
                <a href={pageUrl}>👉 Test : {label}</a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default App;
`;
        fs.writeFileSync(path.join(srcDir, 'App.jsx'), reactAppContent);

    } else if (framework === 'vue') {
        fs.writeFileSync(path.join(srcDir, 'index.html'), `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" /><title>${appName}</title></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>`);
        fs.writeFileSync(path.join(srcDir, 'main.js'), `import { createApp } from 'vue';\nimport App from './App.vue';\nimport './style.css';\n\n${splashCode}\ncreateApp(App).mount('#app');\n`);
        
        const vueAppContent = `<template>
  <div>
    <h1>🚀 ${appName} (Vue.js)</h1>
    <p>Bienvenue dans votre application Capacitor + Vue !</p>
    <div class="file-list">
      <h3>Pages de démonstration disponibles :</h3>
      <p v-if="files.length === 0">Aucune page de test n’a été trouvée.</p>
      <div v-else v-for="file in files" :key="file">
        <a :href="file.replace('./', '')">
          👉 Test : {{ file.replace('./', '').replace('index_', '').replace('_build.html', '').toUpperCase() }}
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
const testFiles = import.meta.glob('./*.html', { eager: true });
const files = Object.keys(testFiles).filter((path) => path !== './index.html');
</script>
`;
        fs.writeFileSync(path.join(srcDir, 'App.vue'), vueAppContent);

    } else {
        fs.writeFileSync(path.join(srcDir, 'index.html'), `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" /><title>${appName}</title><link rel="stylesheet" href="./style.css" /></head><body><div id="app"><h1>🚀 ${appName} (Vanilla JS)</h1></div><script type="module" src="./main.js"></script></body></html>`);
        
        const vanillaMain = `document.addEventListener("DOMContentLoaded", async () => {
  console.log("App loaded");
  ${splashCode}
  const app = document.getElementById("app") || document.body;
  const list = document.createElement("div");
  list.className = "file-list";
  list.innerHTML = "<h3>Pages de démonstration disponibles :</h3>";

  const testFiles = import.meta.glob('./*.html', { eager: false });
  const files = Object.keys(testFiles).filter((path) => path !== './index.html');

  if (files.length === 0) {
    const fallback = document.createElement("p");
    fallback.textContent = "Aucune page de test n’a été trouvée.";
    list.appendChild(fallback);
  } else {
    for (const path of files) {
      const a = document.createElement("a");
      const pageUrl = path.replace('./', '');
      a.href = pageUrl;
      a.textContent = \`👉 Test : \${pageUrl.replace('index_', '').replace('_build.html', '').toUpperCase()}\`;
      a.target = "_self";
      list.appendChild(a);
      list.appendChild(document.createElement("br"));
    }
  }

  app.appendChild(list);
});\n`;
        fs.writeFileSync(path.join(srcDir, 'main.js'), vanillaMain);
    }
}

// ==================== VERIFICATION & AUTO-INSTALLATION DES PRE-REQUIS ====================

async function checkPrerequisites(method, platform) {
    log(`Vérification des prérequis pour ${method} sur ${platform}...`, 'info');

    if (platform === CONFIG.platforms.ANDROID || platform === CONFIG.platforms.BOTH) {
        let jdkPath = CONFIG.androidSDK.jdkDir;
        if (!jdkPath) {
            log('⚠️ JDK 21+ non trouvé ou version incompatible. Installation d\'OpenJDK 21...', 'warning');
            jdkPath = await installPortableJava();
        } else {
            log(`✓ Java 21+ prêt (${jdkPath})`, 'success');
        }

        let sdkPath = CONFIG.androidSDK.androidHome;
        const requiredBuildTools = path.join(LOCAL_TOOLS_DIR, 'android-sdk', 'build-tools', '34.0.0');
        const requiredPlatform = path.join(LOCAL_TOOLS_DIR, 'android-sdk', 'platforms', 'android-34');

        if (!sdkPath || !fs.existsSync(requiredBuildTools) || !fs.existsSync(requiredPlatform)) {
            log('⚠️ Android SDK introuvable ou paquets manquants. Téléchargement et licence...', 'warning');
            sdkPath = await installPortableAndroidSdk();
        } else {
            log(`✓ Android SDK trouvé (${sdkPath})`, 'success');
        }
    }

    if (platform === CONFIG.platforms.IOS || platform === CONFIG.platforms.BOTH) {
        if (os.platform() !== 'darwin') {
            log('✗ Build iOS uniquement possible sur macOS', 'error');
            return false;
        }
    }

    const npmCheck = runCommand('npm', ['--version'], { stdio: 'ignore' });
    if (npmCheck.status === 0) {
        log('✓ NPM installé', 'success');
    } else {
        log('✗ NPM non trouvé', 'error');
        return false;
    }

    return true;
}

// ==================== BUILD SYSTEM ====================

function ensureMinimumGradleVersion(androidDir) {
    const wrapperPath = path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.properties');
    if (fs.existsSync(wrapperPath)) {
        let content = fs.readFileSync(wrapperPath, 'utf8');
        const match = content.match(/gradle-(\d+)\.(\d+)(?:\.\d+)?-(all|bin)\.zip/);
        if (match) {
            const major = parseInt(match[1], 10);
            const minor = parseInt(match[2], 10);
            if (major < 8 || (major === 8 && minor < 7)) {
                log('🔧 Mise à jour automatique de Gradle vers 8.7 (compatibilité Java 21)...', 'info');
                content = content.replace(/gradle-\d+\.\d+(?:\.\d+)?-(all|bin)\.zip/, 'gradle-8.7-$1.zip');
                fs.writeFileSync(wrapperPath, content);
            }
        }
    }
}

function signApkIfConfigured(apkPath) {
    const keyPath = process.env.KEYSTORE_PATH;
    const keyAlias = process.env.KEYSTORE_ALIAS;
    const keyPass = process.env.KEYSTORE_PASSWORD;

    if (keyPath && fs.existsSync(keyPath) && keyAlias && keyPass) {
        log('🔐 Tentative de signature automatique du fichier APK Release...', 'step');
        const sdkPath = CONFIG.androidSDK.androidHome;
        if (!sdkPath) return;

        const buildToolsDir = path.join(sdkPath, 'build-tools');
        if (fs.existsSync(buildToolsDir)) {
            const versions = fs.readdirSync(buildToolsDir);
            if (versions.length > 0) {
                const latestVersion = versions.sort().pop();
                const apksignerBin = os.platform() === 'win32'
                    ? path.join(buildToolsDir, latestVersion, 'apksigner.bat')
                    : path.join(buildToolsDir, latestVersion, 'apksigner');

                if (fs.existsSync(apksignerBin)) {
                    const args = ['sign', '--ks', keyPath, '--ks-key-alias', keyAlias, '--ks-pass', `pass:${keyPass}`, apkPath];
                    const signRes = runCommand(apksignerBin, args);
                    if (signRes.status === 0) {
                        log('✅ APK Release signé avec succès !', 'success');
                    } else {
                        log('❌ Échec lors de la signature apksigner.', 'error');
                    }
                }
            }
        }
    } else {
        log('ℹ️ APK Release généré sans signature automatique.', 'warning');
        log('💡 Pour signer automatiquement : renseignez KEYSTORE_PATH, KEYSTORE_ALIAS et KEYSTORE_PASSWORD dans votre .env', 'info');
    }
}

class AppBuilder {
    constructor(method, platform) {
        this.method = method;
        this.platform = platform;
        this.projectRoot = __dirname;
    }

    async build() {
        log(`🏗️ Build avec ${this.method} pour ${this.platform}`, 'step');

        switch (this.method) {
            case CONFIG.methods.CAPACITOR:
                return this.buildWithCapacitor();
            case CONFIG.methods.GRADLE_ONLY:
                return this.buildAndroidGradle();
            default:
                throw new Error(`Méthode de build non supportée: ${this.method}`);
        }
    }

    async buildWithCapacitor() {
        ensureViteMultiPageConfig(CONFIG.framework);

        log('[1/4] Build du projet web...', 'step');
        runCommand('npm', ['run', 'build']);

        if (this.platform === CONFIG.platforms.ANDROID || this.platform === CONFIG.platforms.BOTH) {
            const androidDir = path.join(this.projectRoot, 'android');
            if (!fs.existsSync(androidDir)) {
                runCommand('npx', ['cap', 'add', 'android']);
            }

            const installedMods = detectInstalledModules();
            syncAndroidManifestPermissions(installedMods);
            syncFullscreenState();

            log('[2/4] Sync Capacitor Android...', 'step');
            runCommand('npx', ['cap', 'sync', 'android']);
            log('[3/4] Build Android APK via Gradle...', 'step');
            return await this.buildAndroidGradle();
        }
        return true;
    }

    async buildAndroidGradle(projectDir = null) {
        const androidDir = projectDir || path.join(this.projectRoot, 'android');
        if (!fs.existsSync(androidDir)) throw new Error(`Dossier Android non trouvé: ${androidDir}`);

        ensureMinimumGradleVersion(androidDir);

        const isWin = os.platform() === 'win32';
        const gradlew = isWin ? 'gradlew.bat' : './gradlew';
        const env = { ...process.env };

        const jdkPath = CONFIG.androidSDK.jdkDir;
        if (jdkPath && jdkPath !== 'SYSTEM_GLOBAL' && fs.existsSync(jdkPath)) {
            env.JAVA_HOME = jdkPath;
            env.PATH = `${path.join(jdkPath, 'bin')}${path.delimiter}${env.PATH}`;
        }
        const sdkPath = CONFIG.androidSDK.androidHome;
        if (sdkPath && fs.existsSync(sdkPath)) {
            env.ANDROID_HOME = sdkPath;
            env.PATH = `${path.join(sdkPath, 'platform-tools')}${path.delimiter}${env.PATH}`;
        }

        const baseTask = CONFIG.buildType === 'release' ? 'assembleRelease' : 'assembleDebug';
        const gradleArgs = CONFIG.cleanBuild ? ['clean', baseTask, '--no-daemon'] : [baseTask, '--no-daemon'];
        
        const buildRes = runCommand(path.join(androidDir, gradlew), gradleArgs, { cwd: androidDir, env });
        if (buildRes.status !== 0) {
            log('⚠️ Le build Gradle a échoué.', 'error');
            log('💡 ASTUCE : Si l\'erreur mentionne cache/jars-9, supprimez le dossier .gradle/caches dans votre répertoire utilisateur.', 'warning');
            throw new Error('Échec de la compilation Gradle');
        }

        const apkPattern = CONFIG.buildType === 'release' ? 'app-release.apk' : 'app-debug.apk';
        const possiblePaths = [
            path.join(androidDir, 'app', 'build', 'outputs', 'apk', CONFIG.buildType, apkPattern),
            path.join(androidDir, 'app', 'build', 'outputs', 'apk', CONFIG.buildType, `app-${CONFIG.buildType}.apk`)
        ];
        const apkSrc = possiblePaths.find(p => fs.existsSync(p));
        if (apkSrc) {
            const apkDest = path.join(this.projectRoot, `SimulQuest_App_${CONFIG.buildType}.apk`);
            fs.copyFileSync(apkSrc, apkDest);
            
            if (CONFIG.buildType === 'release') {
                signApkIfConfigured(apkDest);
            }
            
            log(`\n🎉 APK disponible à : ${apkDest}`, 'success');
            return apkDest;
        }
    }
}

async function interactiveMode() {
    log('=== 🤖 Simul Quest Build System ===', 'step');
    return { method: CONFIG.defaultMethod, platform: CONFIG.defaultPlatform };
}

async function main() {
    console.log(colors.bold('\n🔨 Simul Quest Build System\n'));
    const packageJsonPath = path.join(__dirname, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
        await createNewProject();
    } else {
        const createAns = await askQuestion('Un projet existe déjà.\n[1] Compiler, [2] Gérer les modules, [3] Re-créer à zéro ? (1/2/3) [1]: ');
        if (createAns.trim() === '2') {
            await manageModulesInteractive();
            process.exit(0);
        } else if (createAns.trim() === '3') {
            await createNewProject();
        }
    }

    const choices = await interactiveMode();
    
    const isReady = await checkPrerequisites(choices.method, choices.platform);
    if (!isReady) {
        process.exit(1);
    }
    
    const builder = new AppBuilder(choices.method, choices.platform);

    try {
        await builder.build();
        log('🎉 Processus terminé avec succès !', 'success');
    } catch (error) {
        log(`Erreur: ${error.message}`, 'error');
    }
}

main();