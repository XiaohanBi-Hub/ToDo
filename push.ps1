# PowerShell 版本的 Git 推送脚本

param(
    [string]$CommitMsg = "update"
)

# 设置错误时退出
$ErrorActionPreference = "Stop"

Write-Host "开始执行 Git 推送..." -ForegroundColor Blue

# 检查是否有未提交的更改
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "没有需要提交的更改" -ForegroundColor Yellow
    exit 0
}

# 添加所有更改
Write-Host "添加所有更改..." -ForegroundColor Blue
git add .

# 提交更改
Write-Host "提交更改: $CommitMsg" -ForegroundColor Blue
git commit -m $CommitMsg

# 推送到远程仓库
Write-Host "推送到远程仓库..." -ForegroundColor Blue
git push

Write-Host "✓ 推送完成！" -ForegroundColor Green

