<#
.SYNOPSIS
  تهيئة Microsoft SQL Server Express المحلي للعمل مع منصة درب عبر المنفذ 1433 والمصادقة المختلطة.
.DESCRIPTION
  يشغّل بصلاحيات المسؤول (Run as Administrator) لتفعيل بروتوكول TCP/IP على المنفذ 1433،
  وتفعيل وضع المصادقة المختلطة (SQL Server + Windows Auth)، ثم إنشاء مستخدم مخصص
  وقاعدة البيانات (darb_books) دون تخزين أي كلمات مرور في المستودع.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra/setup-sqlexpress.ps1
#>

[CmdletBinding()]
param(
  [string]$InstanceName = 'SQLEXPRESS',
  [string]$DatabaseName = 'darb_books',
  [string]$SqlUser = 'darb',
  [string]$SqlPassword,
  [int]$Port = 1433
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error 'يرجى تشغيل PowerShell بصلاحيات المسؤول (Run as Administrator) لتطبيق إعدادات SQL Server.'
  exit 1
}

if (-not $SqlPassword) {
  $securePwd = Read-Host "أدخل كلمة مرور قوية لحساب SQL Server ($SqlUser)" -AsSecureString
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
  try {
    $SqlPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if ([string]::IsNullOrWhiteSpace($SqlPassword) -or $SqlPassword.Length -lt 8) {
  Write-Error 'يجب إدخال كلمة مرور لا تقل عن 8 أحرف وتستوفي تعقيد SQL Server.'
  exit 1
}

if ($DatabaseName -notmatch '^[a-zA-Z0-9_]+$' -or $SqlUser -notmatch '^[a-zA-Z0-9_]+$') {
  Write-Error 'اسم المستخدم وقاعدة البيانات يجب أن يقتصرا على الأحرف الإنجليزية والأرقام والشرطة السفلية.'
  exit 1
}

$instanceRegRoot = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL' -ErrorAction SilentlyContinue
$instanceKey = $instanceRegRoot.$InstanceName
if (-not $instanceKey) {
  Write-Error "تعذر العثور على SQL Server Instance باسم '$InstanceName' في سجل النظام."
  exit 1
}

$mssqlRegBase = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceKey\MSSQLServer"
$tcpBase = "$mssqlRegBase\SuperSocketNetLib\Tcp"
$ipAllPath = "$tcpBase\IPAll"

Write-Host "[1/4] تفعيل وضع المصادقة المختلطة (Mixed Mode Auth) لـ $InstanceName..." -ForegroundColor Cyan
Set-ItemProperty -Path $mssqlRegBase -Name 'LoginMode' -Value 2

Write-Host "[2/4] تفعيل TCP/IP وتعيين المنفذ الثابت $Port..." -ForegroundColor Cyan
Set-ItemProperty -Path $tcpBase -Name 'Enabled' -Value 1
if (Test-Path $ipAllPath) {
  Set-ItemProperty -Path $ipAllPath -Name 'TcpDynamicPorts' -Value ''
  Set-ItemProperty -Path $ipAllPath -Name 'TcpPort' -Value "$Port"
}

$serviceName = if ($InstanceName -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { "MSSQL`$$InstanceName" }
Write-Host "[3/4] إعادة تشغيل خدمة $serviceName لتطبيق الشبكة والمصادقة..." -ForegroundColor Cyan
Restart-Service -Name $serviceName -Force

$serverEndpoint = if ($InstanceName -eq 'MSSQLSERVER') { 'localhost' } else { "localhost\$InstanceName" }
$escapedPwd = $SqlPassword.Replace("'", "''")
$tsql = @"
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$SqlUser')
BEGIN
  CREATE LOGIN [$SqlUser] WITH PASSWORD = N'$escapedPwd', DEFAULT_DATABASE = [master], CHECK_POLICY = ON;
END
ELSE
BEGIN
  ALTER LOGIN [$SqlUser] WITH PASSWORD = N'$escapedPwd';
END;
IF DB_ID(N'$DatabaseName') IS NULL
BEGIN
  CREATE DATABASE [$DatabaseName];
END;
USE [$DatabaseName];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$SqlUser')
BEGIN
  CREATE USER [$SqlUser] FOR LOGIN [$SqlUser];
END;
ALTER ROLE [db_owner] ADD MEMBER [$SqlUser];
"@

Write-Host "[4/4] إنشاء تسجيل الدخول [$SqlUser] وقاعدة [$DatabaseName]..." -ForegroundColor Cyan
sqlcmd -S $serverEndpoint -E -C -b -Q $tsql

Write-Host ''
Write-Host 'تمت تهيئة SQL Server المحلي بنجاح!' -ForegroundColor Green
Write-Host 'أضف السطر التالي إلى ملف apps/api/.env:' -ForegroundColor Yellow
Write-Host "DATABASE_URL=sqlserver://127.0.0.1:$Port;database=$DatabaseName;user=$SqlUser;password=<كلمة-المرور-التي-اخترتها>;encrypt=false;trustServerCertificate=true"
