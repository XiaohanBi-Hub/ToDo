@echo off
chcp 65001 >nul
setlocal

REM 获取提交信息（如果提供参数则使用，否则使用默认值）
if "%~1"=="" (
    set "COMMIT_MSG=update"
) else (
    set "COMMIT_MSG=%~1"
)

echo 开始执行 Git 推送...

REM 检查是否有未提交的更改
git status --porcelain >nul 2>&1
if errorlevel 1 (
    echo 没有需要提交的更改
    exit /b 0
)

REM 添加所有更改
echo 添加所有更改...
git add .

REM 提交更改
echo 提交更改: %COMMIT_MSG%
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo 提交失败！
    exit /b 1
)

REM 推送到远程仓库（带重试机制）
echo 推送到远程仓库...
set RETRY_COUNT=0
set MAX_RETRIES=3

:push_retry
git push
if errorlevel 1 (
    set /a RETRY_COUNT+=1
    if %RETRY_COUNT% LSS %MAX_RETRIES% (
        echo 推送失败，正在重试 (%RETRY_COUNT%/%MAX_RETRIES%)...
        timeout /t 3 /nobreak >nul
        goto push_retry
    ) else (
        echo.
        echo ========================================
        echo 推送失败！可能的原因：
        echo 1. 网络连接问题 - 请检查网络连接
        echo 2. 防火墙/代理设置 - 可能需要配置 Git 代理
        echo 3. GitHub 服务暂时不可用
        echo.
        echo 解决方案：
        echo - 检查网络连接
        echo - 如果使用代理，配置 Git 代理：
        echo   git config --global http.proxy http://代理地址:端口
        echo - 或尝试使用 SSH 方式：
        echo   git remote set-url origin git@github.com:XiaohanBi-Hub/ToDo.git
        echo ========================================
        exit /b 1
    )
)

echo ✓ 推送完成！
pause

