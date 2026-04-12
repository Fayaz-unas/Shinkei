// backend/utils/dynamicLauncher.js

const fs = require("fs-extra");
const path = require("path");
const net = require("net");
const http = require("http");
const https = require("https");
const { execSync, exec } = require("child_process");

const { index } = require("../services/indexBuilder"); 
const sseService = require("../services/sseService"); 
const { TRACING_CODE, REQUIRE_HOOK_CODE } = require("./tracingTemplates");
const { BABEL_PLUGIN_CODE, CLIENT_SCRIPT_CODE } = require("./domTemplates");

let activeProcesses = [];

function openUrlInBrowser(url) {
    let command;

    if (process.platform === 'win32') {
        command = `start "" "${url}"`;
    } else if (process.platform === 'darwin') {
        command = `open "${url}"`;
    } else {
        command = `xdg-open "${url}"`;
    }

    exec(command, (err) => {
        if (err) {
            console.warn(`⚠️ [Shinkei] Could not auto-open browser (${err.message}).`);
        }
    });
}

function isFrontendReadyOutput(output) {
    const line = String(output || '').toLowerCase();
    return (
        line.includes('localhost:') ||
        line.includes('local:') ||
        line.includes('compiled successfully') ||
        line.includes('ready in') ||
        line.includes('webpack compiled')
    );
}

function checkUrlReachable(url) {
    return new Promise((resolve) => {
        try {
            const parsed = new URL(url);
            const client = parsed.protocol === 'https:' ? https : http;
            const req = client.request(
                {
                    method: 'GET',
                    hostname: parsed.hostname,
                    port: parsed.port,
                    path: parsed.pathname || '/',
                    timeout: 1500,
                },
                (res) => {
                    // Any HTTP response means the server is up and accepting connections.
                    res.resume();
                    resolve(true);
                }
            );

            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.end();
        } catch (e) {
            resolve(false);
        }
    });
}

async function waitForUrlReachable(url, timeoutMs = 45000, intervalMs = 750) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        // eslint-disable-next-line no-await-in-loop
        const reachable = await checkUrlReachable(url);
        if (reachable) {
            return true;
        }

        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return false;
}

function findFreePort(startPort) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(startPort, () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
        server.on('error', () => resolve(findFreePort(startPort + 1)));
    });
}

async function stopActiveProcesses() {
    if (activeProcesses.length === 0) return;
    console.log(`🛑 Stopping ${activeProcesses.length} active processes...`);
    for (const proc of activeProcesses) {
        if (proc && !proc.killed) {
            try {
                if (process.platform === 'win32') {
                    execSync(`taskkill /pid ${proc.pid} /f /t`);
                } else {
                    proc.kill('SIGTERM');
                }
            } catch (e) { }
        }
    }
    activeProcesses = [];
}

async function getEntryPoint(repoRoot) {
    const searchDirs = [repoRoot, path.join(repoRoot, 'server'), path.join(repoRoot, 'backend'), path.join(repoRoot, 'api')];

    for (const dir of searchDirs) {
        if (!await fs.pathExists(dir)) continue;

        const pkgPath = path.join(dir, 'package.json');
        if (await fs.pathExists(pkgPath)) {
            const pkg = await fs.readJson(pkgPath);
            if (pkg.main && await fs.pathExists(path.join(dir, pkg.main))) return path.join(dir, pkg.main);
            if (pkg.scripts?.start) {
                const match = pkg.scripts.start.match(/(?:node|nodemon|ts-node)\s+(.+)/);
                if (match && match[1]) {
                    const fullPath = path.join(dir, match[1].trim().split(' ')[0].replace(/['"]/g, ''));
                    if (await fs.pathExists(fullPath)) return fullPath;
                }
            }
        }

        const fallbacks = ['index.js', 'app.js', 'server.js', 'src/index.js', 'src/server.js'];
        for (const f of fallbacks) {
            const fullPath = path.join(dir, f);
            if (await fs.pathExists(fullPath)) return fullPath;
        }
    }
    throw new Error("Shinkei could not find a backend entry point.");
}

async function launchFrontend(repoRoot, options = {}) {
    const candidates = ['frontend', 'client', 'web', 'ui', '.'];
    let frontendPath = null;
    let startCommand = 'npm start';
    const FE_PORT = options.frontendPort;
    const BE_PORT = options.backendPort;

    for (const dir of candidates) {
        const checkPath = path.join(repoRoot, dir, 'package.json');
        if (await fs.pathExists(checkPath)) {
            frontendPath = path.join(repoRoot, dir);
            const pkg = await fs.readJson(checkPath);
            if (pkg.scripts && pkg.scripts.dev) startCommand = 'npm run dev';
            break;
        }
    }

    if (!frontendPath) return null;

    const pkgPath = path.join(frontendPath, 'package.json');
    if (await fs.pathExists(pkgPath)) {
        let pkg = await fs.readJson(pkgPath);
        let changed = false;

        // --- 🟢 VITE: SWC to Babel conversion ---
        if (pkg.devDependencies?.["@vitejs/plugin-react-swc"] || pkg.dependencies?.["@vitejs/plugin-react-swc"]) {
            console.log("⚠️ [Shinkei] SWC detected. Converting to Babel for inspector support...");
            if (pkg.devDependencies) delete pkg.devDependencies["@vitejs/plugin-react-swc"];
            if (pkg.dependencies) delete pkg.dependencies["@vitejs/plugin-react-swc"];
            pkg.devDependencies["@vitejs/plugin-react"] = "^4.0.0";
            changed = true;
        }

        // --- 🔵 CRA: Webpack Hijacking via react-app-rewired ---
        const hasReactScripts = pkg.dependencies?.["react-scripts"] || pkg.devDependencies?.["react-scripts"];
        if (hasReactScripts) {
            console.log("⚠️ [Shinkei] Create React App detected. Hijacking Webpack...");
            
            // Rewrite scripts to use rewired
            if (pkg.scripts?.start && pkg.scripts.start.includes("react-scripts")) {
                pkg.scripts.start = pkg.scripts.start.replace("react-scripts", "react-app-rewired");
                startCommand = 'npm start'; // Ensure we use the patched script
            }
            
            // Add required dependencies
            pkg.devDependencies = pkg.devDependencies || {};
            pkg.devDependencies["react-app-rewired"] = "^2.2.1";
            pkg.devDependencies["customize-cra"] = "^1.0.0";
            changed = true;

            // Generate config-overrides.js
            const absolutePluginPath = path.join(repoRoot, "shinkei-babel-plugin.js").replace(/\\/g, '/');
            const overrideCode = `
const { override, addBabelPlugin } = require('customize-cra');
module.exports = override(
    addBabelPlugin('${absolutePluginPath}')
);
`;
            await fs.writeFile(path.join(frontendPath, 'config-overrides.js'), overrideCode.trim());
            console.log("🛠️  [Shinkei] Generated config-overrides.js for CRA.");
        }

        // Install dependencies if package.json was modified
        if (changed || !fs.existsSync(path.join(frontendPath, 'node_modules'))) {
            await fs.writeJson(pkgPath, pkg, { spaces: 2 });
            console.log("📦 [Shinkei] Installing modified dependencies...");
            try {
                execSync('npm install --no-audit --no-fund', { cwd: frontendPath, stdio: 'inherit' });
            } catch (e) {
                console.error("❌ [Shinkei] Dependency installation failed:", e.message);
            }
        }
    }

    // --- 🧹 CLEAR CACHES ---
    const viteCachePath = path.join(frontendPath, 'node_modules', '.vite');
    const craCachePath = path.join(frontendPath, 'node_modules', '.cache');
    
    if (fs.existsSync(viteCachePath)) {
        console.log("🧹 [Shinkei] Clearing Vite cache to force Babel rebuild...");
        fs.rmSync(viteCachePath, { recursive: true, force: true });
    }
    if (fs.existsSync(craCachePath)) {
        console.log("🧹 [Shinkei] Clearing Webpack cache to force Babel rebuild...");
        fs.rmSync(craCachePath, { recursive: true, force: true });
    }

    let finalCommand = startCommand.startsWith('npm') ? `${startCommand} -- --port ${FE_PORT}` : startCommand;

    const interceptorScript = `
    <script>
      (function() {
        const BE_PORT = '${BE_PORT}';
        const BACKEND_URL = 'http://' + window.location.hostname + ':' + BE_PORT;
        console.log('💉 [Shinkei] Interceptor Active');
        const origFetch = window.fetch;
        window.fetch = (url, init) => {
          if (typeof url === 'string' && (url.startsWith('/api') || url.startsWith('api/'))) {
             return origFetch(BACKEND_URL + (url.startsWith('/') ? url : '/' + url), init);
          }
          return origFetch(url, init);
        };
      })();
    </script>
    <script>${CLIENT_SCRIPT_CODE}</script>`;

    const htmlFiles = [
        path.join(frontendPath, 'index.html'),
        path.join(frontendPath, 'public', 'index.html'),
        path.join(frontendPath, 'src', 'index.html')
    ];

    for (const file of htmlFiles) {
        if (fs.existsSync(file)) {
            let content = fs.readFileSync(file, 'utf8');
            content = content.replace(/<script>.*?\[Shinkei\].*?<\/script>/gs, '');
            content = content.replace('</head>', interceptorScript + '</head>');
            fs.writeFileSync(file, content);
            console.log("[Shinkei] ✅ Injected Inspector into " + path.basename(file));
        }
    }

    console.log(`🚀 Launching Frontend on PORT ${FE_PORT}...`);
    const child = exec(finalCommand, {
        cwd: frontendPath,
        env: { 
            ...process.env, PORT: FE_PORT, BROWSER: 'none',
            REACT_APP_API_URL: `http://localhost:${BE_PORT}`,
            VITE_API_URL: `http://localhost:${BE_PORT}`
        }
    });

    const appUrl = `http://localhost:${FE_PORT}`;
    const shouldOpenBrowser = options.uiEditor !== true;
    let hasOpenedApp = false;
    let isWaitingForReachability = false;

    const markReadyAndOpen = async () => {
        if (hasOpenedApp || isWaitingForReachability) return;
        isWaitingForReachability = true;

        const isReachable = await waitForUrlReachable(appUrl);
        isWaitingForReachability = false;
        if (!isReachable || hasOpenedApp) {
            if (!isReachable) {
                console.warn(`⚠️ [Shinkei] Frontend signaled ready but ${appUrl} is still unreachable.`);
            }
            return;
        }

        hasOpenedApp = true;
        if (shouldOpenBrowser) {
            console.log(`🌐 Target app ready. Opening ${appUrl}...`);
            openUrlInBrowser(appUrl);
        } else {
            console.log(`🌐 Target app ready for UI editor iframe at ${appUrl}.`);
        }
        sseService.broadcast({ type: 'app_opened', url: appUrl });
    };

    child.stdout.on('data', (data) => {
        const text = String(data);
        console.log(`[Target Frontend]: ${text.trim()}`);
        if (isFrontendReadyOutput(text)) {
            markReadyAndOpen();
        }
    });

    child.stderr.on('data', (data) => {
        const text = String(data);
        console.error(`[Target Frontend Error]: ${text.trim()}`);
        if (isFrontendReadyOutput(text)) {
            markReadyAndOpen();
        }
    });

    return child;
}

async function runDynamicEnvironment(repoRoot, options = {}) {
    try {
        await stopActiveProcesses(); 
        console.log("🛠️  Preparing Dynamic Tracing Infrastructure...");

        // Ensure index data exists for the target repo before building runtime trace metadata.
        if (index.repoPath !== repoRoot || index.functionsById.size === 0) {
            await index.build(repoRoot);
        }

        const BE_PORT = await findFreePort(options.backendPort || 8000);
        const FE_PORT = await findFreePort(options.frontendPort || 3000);

        console.log(`📡 Allocated Ports: Backend=${BE_PORT}, Frontend=${FE_PORT}`);

        // Build runtime lookup map used by requireHook.js for attaching shinkei.static.* attributes.
        const astMap = {};
        for (const fnInfo of index.functionsById.values()) {
            if (!fnInfo?.file || !fnInfo?.name || !fnInfo?.startLine) {
                continue;
            }

            const key = `${fnInfo.file}:${fnInfo.name}`;
            if (!astMap[key]) {
                astMap[key] = {
                    file: fnInfo.file,
                    line: fnInfo.startLine,
                };
            }
        }

        await fs.writeJson(path.join(repoRoot, "ast_map.json"), astMap, { spaces: 2 });
        console.log(`🧭 [Shinkei] Generated ast_map.json with ${Object.keys(astMap).length} function entries.`);

        const SHINKEI_PORT = process.env.PORT || 5000;
        const SHINKEI_URL = `http://localhost:${SHINKEI_PORT}`;

        // --- 1. INJECT OTEL TRACING ---
        const finalTracingCode = TRACING_CODE.replace('{{SHINKEI_BACKEND_URL}}', SHINKEI_URL);
        await fs.writeFile(path.join(repoRoot, "tracing.js"), finalTracingCode);
        await fs.writeFile(path.join(repoRoot, "requireHook.js"), REQUIRE_HOOK_CODE);

        // --- 2. PREPARE BABEL CONFIG ---
        const babelPluginPath = path.join(repoRoot, "shinkei-babel-plugin.js").replace(/\\/g, '/');
        await fs.writeFile(babelPluginPath, BABEL_PLUGIN_CODE);
        const babelConfig = { plugins: ["./shinkei-babel-plugin.js"] };
        await fs.writeJson(path.join(repoRoot, "babel.config.json"), babelConfig);
        await fs.writeJson(path.join(repoRoot, ".babelrc"), babelConfig);

        // --- 3. PATCH VITE CONFIG ---
        const vitePaths = [
            path.join(repoRoot, "vite.config.js"), 
            path.join(repoRoot, "vite.config.ts"),
            path.join(repoRoot, "frontend", "vite.config.js"),
            path.join(repoRoot, "frontend", "vite.config.ts"),
            path.join(repoRoot, "client", "vite.config.js"),
            path.join(repoRoot, "client", "vite.config.ts")
        ];
        
        for (const vp of vitePaths) {
            if (await fs.pathExists(vp)) {
                let vCode = await fs.readFile(vp, "utf8");
                console.log(`🛠️  [Shinkei] Patching Vite configuration at ${vp}`);
                
                vCode = vCode.replace(/@vitejs\/plugin-react-swc/g, "@vitejs/plugin-react");
                
                if (!vCode.includes("shinkei-babel-plugin")) {
                    if (vCode.match(/react\(\s*\)/)) {
                        vCode = vCode.replace(/react\(\s*\)/, `react({ babel: { plugins: ['${babelPluginPath}'] } })`);
                    } else if (vCode.match(/react\(/)) {
                        vCode = vCode.replace(/react\(([^)]+)\)/, `react({ ...$1, babel: { plugins: ['${babelPluginPath}'] } })`);
                    }
                }
                await fs.writeFile(vp, vCode);
            }
        }

        // --- 4. LAUNCH BACKEND ---
        const entryFile = await getEntryPoint(repoRoot);
        console.log(`🚀 Launching Backend (${entryFile}) on PORT ${BE_PORT}...`);
        const backendProcess = exec(`node --require ./tracing.js --require ./requireHook.js ${entryFile}`, { 
            cwd: repoRoot,
            env: { ...process.env, PORT: BE_PORT, SHINKEI_REPO_ROOT: repoRoot }
        });
        activeProcesses.push(backendProcess); 
        backendProcess.stdout.on('data', (data) => console.log(`[Target Backend]: ${data.trim()}`));

        // --- 5. LAUNCH FRONTEND ---
        const frontendProcess = await launchFrontend(repoRoot, {
            frontendPort: FE_PORT,
            backendPort: BE_PORT,
            uiEditor: options.uiEditor === true,
        });
        if (frontendProcess) activeProcesses.push(frontendProcess); 

    } catch (err) {
        console.error("❌ Dynamic setup failed:", err.message);
    }
}

module.exports = { runDynamicEnvironment, stopActiveProcesses };