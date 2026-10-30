// installer/windows/WorklogInstaller.cs
//
// worklog-ext-<v>-windows.exe: cài / cập nhật extension vào
// Documents\Worklog Extension, ghi đè không hỏi.
//
// Vì sao là một chương trình C# nhỏ chứ không phải 7-Zip SFX:
//   - SFX của 7-Zip bản gốc không có "giải nén vào thư mục X" (InstallPath chỉ
//     có ở bản mod bên thứ ba); muốn vậy phải giải nén ra temp rồi chạy thêm một
//     script, tức là thêm cmd/PowerShell — thứ hay bị chính sách công ty chặn.
//   - Ở đây làm được đúng việc cần: XOÁ nội dung cũ trước khi bung (không tích
//     file asset hash cũ), tìm đúng Documents kể cả khi bị OneDrive chuyển chỗ,
//     và từ chối đụng vào một thư mục trùng tên không phải của extension.
//   - Biên dịch bằng csc.exe của .NET Framework có sẵn trên mọi Windows 10/11 và
//     trên runner windows-latest; không tải binary nào từ ngoài.
//
// Payload là CHÍNH zip Windows (worklog-ext-<v>-windows.zip), nhúng làm
// resource `payload.zip` — nên exe, zip và dmg luôn cùng nội dung.
//
// KHÔNG ký số: SmartScreen sẽ cảnh báo (More info → Run anyway). Xem README.
//
// /quiet: không hiện hộp thoại nào, chỉ trả exit code (0 ok, 1 thư mục trùng tên
// không phải của extension, 2 lỗi khác) và ghi lỗi ra stderr — dùng cho CI.
//
// Phải giữ được cú pháp C# 5: csc.exe của .NET Framework chỉ hiểu tới đó.
using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Windows.Forms;

static class WorklogInstaller
{
    // Hợp đồng với scripts/pack.mjs (thư mục gốc trong zip) và README.
    const string FolderName = "Worklog Extension";
    const string Title = "Worklog Extension";

    sealed class NotOurFolderException : Exception
    {
        public NotOurFolderException(string message) : base(message) { }
    }

    [STAThread]
    static int Main(string[] args)
    {
        bool quiet = Array.Exists(args, a => a == "/quiet" || a == "--quiet");
        string target = Path.Combine(DocumentsPath(), FolderName);
        try
        {
            string version = Install(target);
            if (!quiet)
            {
                MessageBox.Show(
                    "Đã cài Worklog Extension " + version + " vào:\n" + target + "\n\n"
                    + "Đã dùng từ trước: mở Options của extension → bấm \"Khởi động lại extension\".\n"
                    + "Lần đầu: chrome://extensions → bật Developer mode → Load unpacked → chọn thư mục trên.\n\n"
                    + "Installed into the folder above. Existing users: Options → \"Restart extension\". "
                    + "First time: chrome://extensions → Load unpacked → pick that folder.",
                    Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            return 0;
        }
        catch (NotOurFolderException e)
        {
            Fail(quiet, e.Message);
            return 1;
        }
        catch (Exception e)
        {
            Fail(quiet,
                "Không cài được vào " + target + ":\n" + e.Message + "\n\n"
                + "Đóng Chrome rồi chạy lại. Vẫn lỗi thì dùng file -windows.zip.\n"
                + "Could not install. Close Chrome and run again, or use the -windows.zip.");
            return 2;
        }
    }

    static void Fail(bool quiet, string message)
    {
        if (quiet) Console.Error.WriteLine(message);
        else MessageBox.Show(message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    // Thư mục Documents THẬT, tức cái Explorer hiện là "Documents". Trên máy công ty
    // nó hay bị OneDrive chuyển sang %USERPROFILE%\OneDrive - <Công ty>\Documents;
    // ghi cứng %USERPROFILE%\Documents là cài vào một chỗ người dùng không thấy,
    // và lệch với chỗ họ kéo thả zip vào.
    static string DocumentsPath()
    {
        string docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        if (string.IsNullOrEmpty(docs))
            docs = Path.Combine(Environment.GetEnvironmentVariable("USERPROFILE") ?? "", "Documents");
        return docs;
    }

    /// Trả về version vừa cài (đọc từ manifest.json trong payload).
    static string Install(string target)
    {
        string prefix = FolderName + "/";
        using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
        {
            if (payload == null) throw new InvalidDataException("exe thiếu payload.zip");
            using (ZipArchive zip = new ZipArchive(payload, ZipArchiveMode.Read))
            {
                // Kiểm payload TRƯỚC khi xoá gì: exe hỏng không được để lại một thư
                // mục trống thay cho bản đang chạy được.
                ZipArchiveEntry manifest = zip.GetEntry(prefix + "manifest.json");
                if (manifest == null) throw new InvalidDataException("payload không có manifest.json");
                string version = ReadVersion(manifest);

                ClearTarget(target);

                string root = Path.GetFullPath(target) + Path.DirectorySeparatorChar;
                foreach (ZipArchiveEntry entry in zip.Entries)
                {
                    string name = entry.FullName.Replace('\\', '/');
                    if (!name.StartsWith(prefix, StringComparison.Ordinal)) continue;
                    string relative = name.Substring(prefix.Length);
                    if (relative.Length == 0) continue;

                    string dest = Path.GetFullPath(Path.Combine(target, relative.Replace('/', Path.DirectorySeparatorChar)));
                    // Chặn zip-slip: entry kiểu "../x" không được ghi ra ngoài thư mục đích.
                    if (!dest.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("đường dẫn lạ trong payload: " + entry.FullName);

                    if (name.EndsWith("/", StringComparison.Ordinal))
                    {
                        Directory.CreateDirectory(dest);
                        continue;
                    }
                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                    entry.ExtractToFile(dest, true);
                }
                return version;
            }
        }
    }

    // Xoá NỘI DUNG thư mục đích, giữ lại chính thư mục: Chrome load extension theo
    // đường dẫn này. Mỗi bản build có tên asset kèm hash khác nhau, nên bung đè mà
    // không xoá sẽ tích file cũ mãi mãi (vô hại, nhưng rác).
    //
    // Chỉ xoá khi thư mục trống hoặc có manifest.json ở gốc — tức trông như bản
    // extension cũ. Một thư mục trùng tên chứa thứ khác thì KHÔNG đụng vào.
    static void ClearTarget(string target)
    {
        if (!Directory.Exists(target))
        {
            Directory.CreateDirectory(target);
            return;
        }
        if (Directory.GetFileSystemEntries(target).Length == 0) return;
        if (!File.Exists(Path.Combine(target, "manifest.json")))
        {
            throw new NotOurFolderException(
                target + " đã có và không phải thư mục của Worklog Extension (không có manifest.json) "
                + "— không xoá. Đổi tên hoặc dọn thư mục đó rồi chạy lại.\n"
                + "That folder exists and is not a Worklog Extension folder — left untouched.");
        }
        // File chỉ-đọc làm Delete ném lỗi — bỏ thuộc tính trước.
        foreach (string file in Directory.GetFiles(target, "*", SearchOption.AllDirectories))
            File.SetAttributes(file, FileAttributes.Normal);
        foreach (string file in Directory.GetFiles(target))
            File.Delete(file);
        foreach (string dir in Directory.GetDirectories(target))
            Directory.Delete(dir, true);
    }

    static string ReadVersion(ZipArchiveEntry manifest)
    {
        using (StreamReader reader = new StreamReader(manifest.Open()))
        {
            Match m = Regex.Match(reader.ReadToEnd(), "\"version\"\\s*:\\s*\"([^\"]+)\"");
            return m.Success ? m.Groups[1].Value : "?";
        }
    }
}
