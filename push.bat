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

REM 推送到远程仓库
echo 推送到远程仓库...
git push
if errorlevel 1 (
    echo 推送失败！
    exit /b 1
)

echo ✓ 推送完成！
pause
./push.sh

