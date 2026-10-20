# 推到 GitHub

本机当前**没有 GitHub 凭据**（无 `gh` CLI、无 token、无 credential helper），
所以建仓这一步需要你提供一次授权。三种方式，任选其一。

---

## 方式一：用 token（最快，一条命令）

1. 打开 https://github.com/settings/tokens → Generate new token (classic)
2. 勾选 **`repo`** 权限即可
3. 在 PowerShell 里执行（把 `<TOKEN>` 和 `<用户名>` 换成你的）：

```powershell
cd "C:\deepseek dsh\毛选智能体\dsh-mao-yuan"
$env:GH_TOKEN = "<TOKEN>"

# 建仓（私有仓库，改 false 就是公开）
$body = @{ name = "dsh-mao-yuan"; private = $true; description = "毛选溯源参谋：以《毛选》方法论拆解问题，每个判断可回溯原文出处" } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri "https://api.github.com/user/repos" `
  -Headers @{ Authorization = "token $env:GH_TOKEN"; "User-Agent" = "dsh" } `
  -ContentType "application/json" -Body $body
$r.full_name

# 推
git remote add origin "https://<用户名>:$env:GH_TOKEN@github.com/<用户名>/dsh-mao-yuan.git"
git push -u origin main
git push origin develop
git push origin v0.1.0-a
```

> 推完后把 remote 换成干净地址，免得 token 留在 `.git/config`：
> ```powershell
> git remote set-url origin "https://github.com/<用户名>/dsh-mao-yuan.git"
> ```

---

## 方式二：先在网页建空仓库，再用 Git Credential Manager

1. 打开 https://github.com/new
   - Repository name: `dsh-mao-yuan`
   - **不要**勾选 "Add a README"（本地已有提交，会冲突）
   - Private / Public 随你
2. 回到 PowerShell：

```powershell
cd "C:\deepseek dsh\毛选智能体\dsh-mao-yuan"
git remote add origin https://github.com/<用户名>/dsh-mao-yuan.git
git push -u origin main
```

第一次 push 会弹出浏览器登录窗口，登录一次即可（GCM 会记住）。

---

## 方式三：你自己建好仓库，告诉我地址

把 `https://github.com/<用户名>/dsh-mao-yuan` 发给我，我来加 remote 并推
（届时仍需你在弹出的登录窗口确认一次）。

---

## 推完之后的状态

```
main       ← 稳定，可发布
develop    ← 日常开发
v0.1.0-a   ← A 阶段基线，随时可回退
```

### 回退方法

```powershell
# 看历史
git log --oneline --graph --all

# 回到 A 阶段基线（丢弃之后所有改动）
git reset --hard v0.1.0-a

# 或者只回退某个文件
git checkout v0.1.0-a -- src/bm25.js
```

---

## 不推 GitHub 也能用

插件本身不依赖远端。本地已 commit、已打 tag，随时可回退：

```powershell
dsh plugin --profile web add link:"C:\deepseek dsh\毛选智能体\dsh-mao-yuan"
```
