# คู่มือการใช้งาน Git และ GitHub CLI แบบหลายบัญชี (Multi-Account)

คู่มือนี้สรุปวิธีตั้งค่าบัญชี GitHub แยกเฉพาะโปรเจกต์บน Windows (โดยไม่กระทบค่า global ใน `~/.gitconfig` ของบัญชีหลัก)

---

## 1. ตั้งค่า Git แยกเฉพาะโปรเจกต์ (Per-Repo Config)

รันคำสั่งต่อไปนี้ภายในโฟลเดอร์โปรเจกต์ที่ต้องการใช้บัญชีรอง (เช่น `<account>`):

```powershell
# ตั้งค่าชื่อและอีเมลสำหรับ commit เฉพาะ repo นี้
git config --local user.name "<account>"
git config --local user.email "<noreply-or-email>"

# ตั้ง remote URL แบบมาตรฐาน (ไม่ต้องใส่ <account>@ นำหน้า)
git remote set-url origin https://github.com/<owner>/<repo>.git

# บังคับใช้ Git Credential Manager และระบุ username เฉพาะ repo นี้
# (สำคัญ: ต้องล้าง helper เดิมจาก ~/.gitconfig เช่น gh.exe ก่อนด้วยค่าว่าง "")
git config --local credential.username "<account>"
git config --local --unset-all credential.https://github.com.helper
git config --local --add credential.https://github.com.helper ""
git config --local --add credential.https://github.com.helper manager
```

> **หมายเหตุสำหรับ PowerShell:** หากใช้ `git config --local --add credential.https://github.com.helper ""` แล้วเจอ `error: wrong number of arguments` ให้รันผ่าน Node แทน:
> `node -e "const {execFileSync}=require('child_process'); execFileSync('git',['config','--local','--add','credential.https://github.com.helper','']);"`

---

## 2. ล็อกอินผ่านเบราว์เซอร์ด้วย Git Credential Manager

1. ตรวจสอบรายชื่อบัญชีที่ Git Credential Manager จำไว้แล้ว:
   ```powershell
   git credential-manager github list
   ```
2. หากยังไม่มีบัญชีที่ต้องการ:
   - เปิดเบราว์เซอร์ไปที่ `github.com` และล็อกอินด้วยบัญชีนั้นไว้ก่อน
   - รันคำสั่งล็อกอินใน terminal:
     ```powershell
     git credential-manager github login
     ```

---

## 3. การเปิด Pull Request ด้วย GitHub CLI (`gh`)

`gh` CLI ใช้ **Active Account** เพียง 1 บัญชีต่อครั้ง:

1. ตรวจสอบบัญชีที่ล็อกอินอยู่และบัญชีที่กำลัง active:
   ```powershell
   gh auth status
   ```
2. หากบัญชีเป้าหมายยังไม่เคยล็อกอินใน `gh`:
   ```powershell
   gh auth login --web
   ```
3. สลับบัญชีชั่วคราวก่อนเปิด PR แล้วสลับกลับเมื่อเสร็จ:
   ```powershell
   gh auth switch --user <target-account>
   gh pr create --base develop --head <branch> --title "<title>" --body "<body>"
   gh auth switch --user <main-account>
   ```

---

## 4. การแก้ไขปัญหาที่พบบ่อย (Troubleshooting)

| อาการ / Error ที่พบ | สาเหตุ | วิธีตรวจสอบและแก้ไข |
|---|---|---|
| `Password authentication is not supported for Git operations` | GitHub ไม่รองรับรหัสผ่านบัญชีสำหรับการ push ผ่าน HTTPS | ล็อกอินผ่านเบราว์เซอร์ด้วย `git credential-manager github login` หรือใช้ Personal Access Token (PAT) |
| `Permission to <owner>/<repo>.git denied to <other-account>` (403) | Git หยิบ token ของบัญชีอื่นจาก global helper (`gh.exe`) หรือ credential cache | เช็ก `git config --show-origin --get-regexp credential` แล้วตั้ง `credential.username` + override `credential.https://github.com.helper` เป็น `manager` ตามข้อ 1 |
| `pull request create failed: GraphQL: must be a collaborator` | `gh` CLI กำลัง active อยู่คนละบัญชีกับเจ้าของ repo | เช็กด้วย `gh auth status` แล้วรัน `gh auth switch --user <target-account>` หรือเปิด PR ผ่านลิงก์ GitHub compare URL |
