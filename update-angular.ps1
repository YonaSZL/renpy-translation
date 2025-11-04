# Stop on first error
$ErrorActionPreference = "Stop"

# Target versions
$TARGET_NODE = "24.11.0"
$TARGET_ANGULAR = "20.2.x"
$TARGET_TYPESCRIPT = "5.9.3"
$TARGET_RxJS = "7.8.2"
$TARGET_NGX_TRANSLATE_CORE = "16.0.4"
$TARGET_NGX_TRANSLATE_HTTP = "16.0.1"
$TARGET_CDK = "20.2.x"
$TARGET_BUILD_ANGULAR = "20.2.0"
$TARGET_FILE_SAVER = "2.0.5"
$TARGET_JSZIP = "3.10.1"
$TARGET_ZONE = "0.15.1"
$TARGET_TYPES_FILE_SAVER = "2.0.7"
$TARGET_JASMINE = "5.6.0"
$TARGET_KARMA = "6.4.0"
$TARGET_KARMA_CHROME = "3.2.0"
$TARGET_KARMA_JASMINE = "5.1.0"
$TARGET_KARMA_HTML = "2.1.0"

# Backup function
function Backup-Project {
    Write-Host "`nBacking up package.json, package-lock.json and node_modules..."
    if (Test-Path package.json) { Copy-Item package.json package.json.bak -Force }
    if (Test-Path package-lock.json) { Copy-Item package-lock.json package-lock.json.bak -Force }
    if (Test-Path node_modules) { Copy-Item node_modules node_modules.bak -Recurse -Force }
}

# Rollback function
function Rollback {
    Write-Host "`nERROR occurred. Rolling back..."
    if (Test-Path package.json.bak) { Move-Item package.json.bak package.json -Force }
    if (Test-Path package-lock.json.bak) { Move-Item package-lock.json.bak package-lock.json -Force }
    if (Test-Path node_modules.bak) {
        Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
        Move-Item node_modules.bak node_modules
    }
    Write-Host "Rollback completed."
    exit 1
}

try {
    Write-Host "`n=== Angular 20.2.x full update script ===`n"

    # 1. Check Node.js
    $nodeVersion = (& node -v)
    Write-Host "Current Node.js version: $nodeVersion"
    $nodeMajor = [int]($nodeVersion.TrimStart("v").Split(".")[0])
    $targetMajor = [int]($TARGET_NODE.Split(".")[0])
    if ($nodeMajor -lt $targetMajor) {
        Write-Host "Node version too old. Installing Node $TARGET_NODE..."
        $installerUrl = "https://nodejs.org/dist/v$TARGET_NODE/node-v$TARGET_NODE-x64.msi"
        $tempInstaller = "$env:TEMP\node-$TARGET_NODE.msi"
        Invoke-WebRequest -Uri $installerUrl -OutFile $tempInstaller
        Start-Process msiexec.exe -ArgumentList "/i `"$tempInstaller`" /quiet /norestart" -Wait
        Remove-Item $tempInstaller
        Write-Host "Node $TARGET_NODE installed. Restart PowerShell and rerun the script."
        exit 0
    }

    # 2. Backup existing project
    Backup-Project

    # 3. Remove old Angular packages
    Write-Host "`nRemoving old Angular packages..."
    npm uninstall @angular/cli @angular/core @angular/common @angular/compiler @angular/compiler-cli `
    @angular/forms @angular/platform-browser @angular/platform-browser-dynamic @angular/router @angular/material `
    @angular/cdk @angular-devkit/build-angular file-saver jszip zone.js `
    @ngx-translate/core @ngx-translate/http-loader @types/file-saver @types/jasmine jasmine-core karma `
    karma-chrome-launcher karma-coverage karma-jasmine karma-jasmine-html-reporter rxjs typescript --save --save-dev -f -E | Out-Null

    # Clean node_modules and lock file
    Write-Host "`nCleaning node_modules and package-lock.json..."
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue

    # 4. Install target Angular 20.2.x and all required packages
    Write-Host "`nInstalling Angular 20.2.x and compatible packages..."
    npm install @angular/cli@$TARGET_ANGULAR @angular/core@$TARGET_ANGULAR @angular/common@$TARGET_ANGULAR `
    @angular/compiler@$TARGET_ANGULAR @angular/compiler-cli@$TARGET_ANGULAR @angular/forms@$TARGET_ANGULAR `
    @angular/platform-browser@$TARGET_ANGULAR @angular/platform-browser-dynamic@$TARGET_ANGULAR @angular/router@$TARGET_ANGULAR `
    @angular/material@$TARGET_ANGULAR @angular/cdk@$TARGET_CDK @angular-devkit/build-angular@$TARGET_BUILD_ANGULAR `
    typescript@$TARGET_TYPESCRIPT rxjs@$TARGET_RxJS `
    @ngx-translate/core@$TARGET_NGX_TRANSLATE_CORE @ngx-translate/http-loader@$TARGET_NGX_TRANSLATE_HTTP `
    file-saver@$TARGET_FILE_SAVER jszip@$TARGET_JSZIP zone.js@$TARGET_ZONE `
    @types/file-saver@$TARGET_TYPES_FILE_SAVER @types/jasmine@$TARGET_JASMINE jasmine-core@$TARGET_JASMINE `
    karma@$TARGET_KARMA karma-chrome-launcher@$TARGET_KARMA_CHROME karma-jasmine@$TARGET_KARMA_JASMINE `
    karma-jasmine-html-reporter@$TARGET_KARMA_HTML `
    --save --save-dev --force --legacy-peer-deps

    # 5. Run Angular migrations (including optional)
    Write-Host "`nRunning all Angular migrations..."
    npx ng update @angular/cli @angular/core @angular/material @angular/cdk --migrate-only --force

    # 6. Verify installation
    Write-Host "`nInstalled versions:"
    npx ng version

    # 7. Cleanup backup if everything went well
    Write-Host "`nUpdate successful, removing backups..."
    if (Test-Path package.json.bak) { Remove-Item package.json.bak -Force }
    if (Test-Path package-lock.json.bak) { Remove-Item package-lock.json.bak -Force }
    if (Test-Path node_modules.bak) { Remove-Item -Recurse -Force node_modules.bak }

    Write-Host "`n=== Update completed successfully ==="

} catch {
    Rollback
}
