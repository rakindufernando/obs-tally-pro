using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Web.Script.Serialization;

namespace BumbiTally
{
    internal static class Program
    {
        internal const string CloudUrl = "https://lvzrhzlcyajhhgfqgdar.supabase.co";
        internal const string DashboardUrl = "https://rakindufernando.github.io/obs-tally-pro/#/settings";
        internal const string Developer = "Developed by BUMBI Software Solutions";
        internal static readonly string UserFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OBS TALLY PRO");
        internal static readonly string ConfigFile = Path.Combine(UserFolder, "bumbi-connection.json");
        internal static readonly string StateFile = Path.Combine(UserFolder, "bridge-config.json");
        internal static readonly string AppFolder = AppDomain.CurrentDomain.BaseDirectory;
        internal static readonly string Runner = Path.Combine(AppFolder, "OBS-TALLY-PRO-Bridge.exe");
        internal static readonly string Script = Path.Combine(AppFolder, "bridge.cjs");
        internal const string StartupKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        internal const string StartupName = "BUMBI OBS TALLY PRO";

        [STAThread]
        static void Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--remove-startup") { SetAutoStart(false); return; }
            if (args.Length > 0 && args[0] == "--self-test")
            {
                bool okay = File.Exists(Runner) && File.Exists(Script) && File.Exists(Path.Combine(AppFolder,"bumbi-logo-white.png"));
                if (okay) {
                    string sample = "test-only-password";
                    okay = Decode(Encode(sample)) == sample;
                }
                Console.WriteLine(okay ? "BUMBI installer runtime self-test PASSED" : "BUMBI installer runtime self-test FAILED");
                Environment.ExitCode = okay ? 0 : 1;
                return;
            }
            if (args.Length > 0 && args[0] == "--ui-self-test")
            {
                try {
                    Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                    using(BumbiSplashV2 splash = new BumbiSplashV2()) using(ModernBridgeWindow form = new ModernBridgeWindow())
                    {
                        bool okay = splash.Controls.Count >= 4 && form.HasShutdownControl;
                        Console.WriteLine(okay ? "BUMBI desktop GUI self-test PASSED" : "BUMBI desktop GUI self-test FAILED");
                        Environment.ExitCode = okay ? 0 : 1;
                    }
                } catch(Exception error) { Console.Error.WriteLine(error.ToString());Environment.ExitCode = 1; }
                return;
            }
            bool newInstance;
            using (Mutex mutex = new Mutex(true, @"Local\BUMBI-OBS-TALLY-PRO-Bridge", out newInstance))
            {
                if (!newInstance) { MessageBox.Show("BUMBI OBS TALLY PRO is already running. Check the taskbar.", "OBS TALLY PRO", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (BumbiSplashV2 splash = new BumbiSplashV2())
                {
                    splash.Show(); Application.DoEvents(); Thread.Sleep(1000); splash.Close();
                }
                Application.Run(new ModernBridgeWindow());
            }
        }
        internal static string Encode(string plain)
        {
            return Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(plain), null, DataProtectionScope.CurrentUser));
        }
        internal static string Decode(string encrypted)
        {
            return Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(encrypted), null, DataProtectionScope.CurrentUser));
        }
        internal static void SetAutoStart(bool enabled)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(StartupKey))
            {
                if (enabled) key.SetValue(StartupName, "\"" + Application.ExecutablePath + "\" /autostart", RegistryValueKind.String);
                else key.DeleteValue(StartupName, false);
            }
        }
        internal static bool AutoStartEnabled()
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(StartupKey))
            {
                return key != null && key.GetValue(StartupName) != null;
            }
        }
        internal static void OpenDashboard()
        {
            try { Process.Start(DashboardUrl); } catch (Exception e) { MessageBox.Show(e.Message, "Browser could not open"); }
        }
        internal static PictureBox LogoBox(int x, int y, int width, int height)
        {
            PictureBox box = new PictureBox(); box.SetBounds(x,y,width,height);
            box.BackColor = Color.White; box.SizeMode = PictureBoxSizeMode.Zoom;
            string file = Path.Combine(AppFolder, "bumbi-logo.png");
            if (File.Exists(file)) box.Image = Image.FromFile(file);
            return box;
        }
        internal static Color Bg = Color.FromArgb(8,12,21);
        internal static Color Card = Color.FromArgb(16,25,39);
        internal static Color Stroke = Color.FromArgb(42,60,80);
        internal static Color Muted = Color.FromArgb(151,169,190);
        internal static Color Cyan = Color.FromArgb(0,216,250);
        internal static Label Label(string value, int x,int y,int w,int h,int size,bool heavy,Color color)
        {
            Label label = new Label(); label.Text=value; label.SetBounds(x,y,w,h);
            label.ForeColor=color; label.Font=new Font("Segoe UI",size,heavy ? FontStyle.Bold : FontStyle.Regular);
            label.TextAlign=ContentAlignment.MiddleLeft; return label;
        }
        internal static Button Button(string value,int x,int y,int w,int h,Color bg,Color fg)
        {
            Button button=new Button(); button.Text=value;button.SetBounds(x,y,w,h);button.FlatStyle=FlatStyle.Flat;
            button.FlatAppearance.BorderSize=0;button.BackColor=bg;button.ForeColor=fg;
            button.Font=new Font("Segoe UI",10,FontStyle.Bold);button.Cursor=Cursors.Hand;return button;
        }
        internal static void SafeSave(Connection c)
        {
            Directory.CreateDirectory(UserFolder);
            string json=new JavaScriptSerializer().Serialize(c);
            string temp=ConfigFile+".tmp";
            File.WriteAllText(temp,json,Encoding.UTF8);
            if (File.Exists(ConfigFile)) File.Delete(ConfigFile);
            File.Move(temp,ConfigFile);
        }
        internal static Connection ReadConnection()
        {
            if (!File.Exists(ConfigFile)) return null;
            return new JavaScriptSerializer().Deserialize<Connection>(File.ReadAllText(ConfigFile,Encoding.UTF8));
        }
    }

    public class Connection
    {
        public string obsUrl {get;set;}
        public string encryptedPassword {get;set;}
        public int version {get;set;}
    }

    internal sealed class Splash : Form
    {
        public Splash()
        {
            Width=590;Height=350;StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.None;
            BackColor=Program.Bg; ShowInTaskbar=false; TopMost=true;
            PictureBox logo=Program.LogoBox(100,35,390,155); Controls.Add(logo);
            Controls.Add(Program.Label("BUMBI Software Solutions",100,207,400,33,20,true,Color.White));
            Controls.Add(Program.Label("PRESENTS  •  OBS TALLY PRO",100,243,430,27,11,true,Program.Cyan));
            Controls.Add(Program.Label(Program.Developer,100,292,400,23,9,false,Program.Muted));
        }
    }

    internal sealed class SettingsWindow : Form
    {
        internal string Url;
        internal string Password;
        private TextBox urlBox;
        private TextBox passwordBox;
        internal SettingsWindow(Connection prior)
        {
            Text="OBS Connection Settings";Width=600;Height=410;StartPosition=FormStartPosition.CenterParent;
            BackColor=Program.Bg;ForeColor=Color.White;FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;
            Controls.Add(Program.Label("OBS CONNECTION SETTINGS",30,23,530,40,20,true,Color.White));
            Controls.Add(Program.Label("Configure the WebSocket server on this Windows PC.",30,63,515,25,10,false,Program.Muted));
            Controls.Add(Program.Label("OBS WebSocket address",30,110,500,22,10,true,Color.White));
            urlBox=Input(30,134,520,false);urlBox.Text=prior == null ? "ws://127.0.0.1:4455" : prior.obsUrl;Controls.Add(urlBox);
            Controls.Add(Program.Label("OBS WebSocket password",30,191,500,22,10,true,Color.White));
            passwordBox=Input(30,215,520,true);if(prior!=null){try{passwordBox.Text=Program.Decode(prior.encryptedPassword);}catch{}}Controls.Add(passwordBox);
            Controls.Add(Program.Label("Password is encrypted for your Windows account. It is never uploaded to GitHub.",30,262,530,26,9,false,Program.Muted));
            Button cancel=Program.Button("Cancel",285,314,120,38,Program.Stroke,Color.White);cancel.Click+=delegate{DialogResult=DialogResult.Cancel;Close();};Controls.Add(cancel);
            Button save=Program.Button("Save settings",414,314,136,38,Program.Cyan,Color.Black);save.Click+=Save;Controls.Add(save);
            AcceptButton=save;
        }
        static TextBox Input(int x,int y,int width,bool secret)
        {
            TextBox tb=new TextBox();tb.SetBounds(x,y,width,34);tb.Font=new Font("Segoe UI",12);tb.BackColor=Program.Card;tb.ForeColor=Color.White;tb.BorderStyle=BorderStyle.FixedSingle;
            tb.UseSystemPasswordChar=secret;return tb;
        }
        void Save(object sender,EventArgs e)
        {
            string uri=urlBox.Text.Trim();Uri parsed;
            if (!Uri.TryCreate(uri,UriKind.Absolute,out parsed) || (parsed.Scheme!="ws" && parsed.Scheme!="wss") || parsed.Port<1 || parsed.Port>65535)
            {
                MessageBox.Show("Use a valid OBS WebSocket URL, for example ws://127.0.0.1:4455", "Invalid URL");return;
            }
            if (passwordBox.Text.Length==0) { MessageBox.Show("Enter the OBS WebSocket password. Authentication must be enabled in OBS.","Password needed");return; }
            Url=uri;Password=passwordBox.Text;DialogResult=DialogResult.OK;Close();
        }
    }

    internal sealed class RegistrationWindow : Form
    {
        internal string Code;
        TextBox field;
        public RegistrationWindow()
        {
            Text="Register This Computer";Width=600;Height=380;StartPosition=FormStartPosition.CenterParent;
            BackColor=Program.Bg;ForeColor=Color.White;FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;
            Controls.Add(Program.Label("REGISTER STREAMING PC",30,22,530,35,19,true,Color.White));
            Controls.Add(Program.Label("Generate a 10-minute Bridge code in the director dashboard.",30,63,520,42,10,false,Program.Muted));
            Button dashboard=Program.Button("Open director dashboard",30,119,235,36,Program.Stroke,Color.White);
            dashboard.Click+=delegate {Program.OpenDashboard();};Controls.Add(dashboard);
            Controls.Add(Program.Label("Paste your new Bridge registration code",30,173,525,24,10,true,Color.White));
            field=new TextBox();field.SetBounds(30,205,520,32);field.Font=new Font("Consolas",11);
            field.BorderStyle=BorderStyle.FixedSingle;field.BackColor=Program.Card;field.ForeColor=Color.White;Controls.Add(field);
            Controls.Add(Program.Label("Pairing a replacement PC revokes the previous PC for this production.",30,246,530,28,9,false,Program.Muted));
            Button cancel=Program.Button("Cancel",285,287,120,37,Program.Stroke,Color.White);cancel.Click+=delegate {DialogResult=DialogResult.Cancel;Close();};Controls.Add(cancel);
            Button pair=Program.Button("Register PC",414,287,136,37,Program.Cyan,Color.Black);pair.Click+=Pair;Controls.Add(pair);AcceptButton=pair;
        }
        void Pair(object sender,EventArgs e)
        {
            string s=field.Text.Trim();
            if (s.Length!=48 || !System.Text.RegularExpressions.Regex.IsMatch(s,@"\A[0-9a-fA-F]{48}\z"))
            {MessageBox.Show("Enter a fresh 48-character Bridge registration code from the website.","Invalid code");return;}
            Code=s.ToLowerInvariant();DialogResult=DialogResult.OK;Close();
        }
    }

    internal sealed class BridgeWindow : Form
    {
        Process bridge;
        Label bridgeValue,obsValue,cloudValue,registeredValue;
        Button startButton,stopButton,registerButton,autoButton;
        RichTextBox log;
        bool stopping=false;
        bool exiting=false;
        NotifyIcon tray;
        Connection config;
        int lines=0;
        public BridgeWindow()
        {
            Text="OBS TALLY PRO  |  BUMBI Software Solutions";Width=980;Height=760;MinimumSize=new Size(960,630);
            StartPosition=FormStartPosition.CenterScreen;BackColor=Program.Bg;ForeColor=Color.White;
            Icon=new Icon(Path.Combine(Program.AppFolder,"bumbi.ico"));
            BuildUi();
            Load+=delegate { OnOpen(); };
            FormClosing+=delegate(object sender,FormClosingEventArgs e) {
                if(!exiting && e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();if(tray!=null){tray.BalloonTipTitle="OBS TALLY PRO";tray.BalloonTipText="The Bridge remains active in the notification area.";tray.ShowBalloonTip(1800);}return;}
                StopBridge();if(tray!=null){tray.Visible=false;tray.Dispose();tray=null;}
            };
        }
        void BuildUi()
        {
            Panel head=new Panel();head.BackColor=Program.Card;head.SetBounds(0,0,970,112);head.Anchor=AnchorStyles.Left|AnchorStyles.Top|AnchorStyles.Right;Controls.Add(head);
            PictureBox logo=Program.LogoBox(24,19,205,77);head.Controls.Add(logo);
            head.Controls.Add(Program.Label("BUMBI SOFTWARE SOLUTIONS",253,18,500,23,10,true,Program.Cyan));
            head.Controls.Add(Program.Label("OBS TALLY PRO  |  LOCAL BRIDGE CONTROL",252,43,560,40,19,true,Color.White));
            head.Controls.Add(Program.Label("Install once. Connect any streaming PC. Monitor live tally states.",252,82,640,19,9,false,Program.Muted));
            Controls.Add(Program.Label("YOUR STREAMING COMPUTER",27,130,750,36,18,true,Color.White));
            Controls.Add(Program.Label("Use OBS Studio on this PC. Your cameramen can open the online website anywhere.",27,162,880,26,10,false,Program.Muted));
            int y=210;
            bridgeValue=StatusCard(27,y,"BRIDGE PROCESS","STOPPED",Program.Muted);
            obsValue=StatusCard(342,y,"OBS WEBSOCKET","NOT CONNECTED",Program.Muted);
            cloudValue=StatusCard(658,y,"SUPABASE CLOUD","NOT CONNECTED",Program.Muted);
            registeredValue=Program.Label("PC REGISTRATION    Not registered",29,308,870,31,11,false,Program.Muted);Controls.Add(registeredValue);
            startButton=Program.Button("START BRIDGE",27,356,186,49,Program.Cyan,Color.Black);startButton.Click+=delegate {StartBridge(null);};Controls.Add(startButton);
            stopButton=Program.Button("STOP BRIDGE",225,356,157,49,Color.FromArgb(122,31,48),Color.White);stopButton.Click+=delegate {StopBridge();};stopButton.Enabled=false;Controls.Add(stopButton);
            Button settings=Program.Button("OBS SETTINGS",395,356,165,49,Program.Stroke,Color.White);settings.Click+=delegate {Configure();};Controls.Add(settings);
            registerButton=Program.Button("REGISTER / MOVE PC",573,356,199,49,Program.Stroke,Color.White);registerButton.Click+=delegate {Register();};Controls.Add(registerButton);
            Button website=Program.Button("WEBSITE",785,356,153,49,Program.Stroke,Color.White);website.Click+=delegate {Program.OpenDashboard();};Controls.Add(website);
            autoButton=Program.Button("",27,421,236,36,Program.Stroke,Color.White);autoButton.Click+=delegate {ToggleStartup();};Controls.Add(autoButton);
            Button portButton=Program.Button("CHECK OBS PORT",275,421,200,36,Program.Stroke,Color.White);portButton.Click+=delegate {CheckPort();};Controls.Add(portButton);
            Controls.Add(Program.Label("LIVE CONNECTION LOG",29,469,700,30,13,true,Color.White));
            log=new RichTextBox();log.SetBounds(27,508,910,146);log.Anchor=AnchorStyles.Left|AnchorStyles.Right|AnchorStyles.Top|AnchorStyles.Bottom;
            log.BackColor=Color.FromArgb(10,18,28);log.ForeColor=Color.FromArgb(207,225,237);log.Font=new Font("Consolas",9);
            log.ReadOnly=true;log.BorderStyle=BorderStyle.FixedSingle;log.ScrollBars=RichTextBoxScrollBars.Vertical;Controls.Add(log);
            Label footer=Program.Label(Program.Developer+"   |   OBS TALLY PRO",27,669,910,27,10,true,Program.Muted);
            footer.Anchor=AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right;Controls.Add(footer);
            Resize+=delegate {head.Width=ClientSize.Width; PositionResponsive();};
            UpdateButtons();
        }
        Label StatusCard(int x,int y,string heading,string value,Color color)
        {
            Panel panel=new Panel();panel.SetBounds(x,y,280,84);panel.BackColor=Program.Card;Controls.Add(panel);
            panel.Controls.Add(Program.Label(heading,14,9,252,20,9,true,Program.Muted));
            Label result=Program.Label(value,14,36,251,32,14,true,color);panel.Controls.Add(result);return result;
        }
        void PositionResponsive()
        {
            foreach(Control item in Controls)
            { if(item is RichTextBox){ item.Width=Math.Max(570,ClientSize.Width-54);item.Height=Math.Max(115,ClientSize.Height-566); } }
        }
        void OnOpen()
        {
            try {
                tray=new NotifyIcon();tray.Icon=new Icon(Path.Combine(Program.AppFolder,"bumbi.ico"));tray.Text="BUMBI OBS TALLY PRO Bridge";tray.Visible=true;
                ContextMenu menu=new ContextMenu();
                menu.MenuItems.Add("Show OBS TALLY PRO",delegate {Show();WindowState=FormWindowState.Normal;Activate();});
                menu.MenuItems.Add("Stop Bridge",delegate {StopBridge();});
                menu.MenuItems.Add("Exit",delegate {exiting=true;Close();});
                tray.ContextMenu=menu;
                tray.DoubleClick+=delegate{Show();WindowState=FormWindowState.Normal;Activate();};
            } catch (Exception e){Append("Tray icon unavailable: "+e.Message);}
            string oldShortcut=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"OBS TALLY PRO Bridge.lnk");
            if(File.Exists(oldShortcut))Append("Legacy portable autostart detected. Disable the old shortcut before enabling startup here.");
            Append("BUMBI Software Solutions  •  OBS TALLY PRO desktop bridge");
            if (!File.Exists(Program.Runner) || !File.Exists(Program.Script))
            {MessageBox.Show("Bridge runtime files are missing. Reinstall OBS TALLY PRO.","Installation incomplete",MessageBoxButtons.OK,MessageBoxIcon.Error);return;}
            try { config=Program.ReadConnection(); }
            catch (Exception e) { Append("Settings could not be read: " + e.Message); }
            UpdateButtons();
            if(config==null)
            {
                Append("First-run setup. Open OBS WebSocket settings and save your connection details.");Configure();
            }
            if (config!=null && File.Exists(Program.StateFile)) StartBridge(null);
            else if(config!=null) Append("Generate a Bridge registration code in the director website, then click REGISTER / MOVE PC.");
        }
        void UpdateButtons()
        {
            bool running=bridge!=null && !bridge.HasExited;
            if(startButton!=null)startButton.Enabled=!running;
            if(stopButton!=null)stopButton.Enabled=running;
            if(registerButton!=null)registerButton.Enabled=true;
            if(autoButton!=null)autoButton.Text=Program.AutoStartEnabled()?"START WITH WINDOWS   ON":"START WITH WINDOWS   OFF";
            if(registeredValue!=null)registeredValue.Text=File.Exists(Program.StateFile)?"PC REGISTRATION    Paired to your cloud production":"PC REGISTRATION    Not registered";
        }
        void Append(string message)
        {
            if(log==null||log.IsDisposed)return;
            if(log.InvokeRequired){try{log.BeginInvoke(new Action<string>(Append),message);}catch{}return;}
            log.AppendText(DateTime.Now.ToString("HH:mm:ss")+"   "+message+Environment.NewLine);
            if (++lines>550){string[] arr=log.Lines;if(arr.Length>350){string[] tail=new string[350];Array.Copy(arr,arr.Length-350,tail,0,350);log.Lines=tail;lines=350;}}
            log.SelectionStart=log.TextLength;log.ScrollToCaret();
            if(message.Contains("OBS WebSocket connected")) obsValue.Text="CONNECTED";
            if(message.Contains("OBS WebSocket connected")) obsValue.ForeColor=Color.FromArgb(24,220,119);
            if(message.Contains("OBS connection lost")||message.Contains("OBS unavailable")){obsValue.Text="RECONNECTING";obsValue.ForeColor=Color.FromArgb(255,184,71);}
            if(message.Contains("Published #")){cloudValue.Text="SYNCING LIVE";cloudValue.ForeColor=Color.FromArgb(24,220,119);}
            if(message.Contains("Cloud publish")||message.Contains("Cloud heartbeat")||message.Contains("Cloud config")){cloudValue.Text="CONNECTION ISSUE";cloudValue.ForeColor=Color.FromArgb(255,184,71);}
        }
        void StartBridge(string registration)
        {
            if(bridge!=null&&!bridge.HasExited)return;
            foreach(Process other in Process.GetProcessesByName("OBS-TALLY-PRO-Bridge")){
                try{if(!other.HasExited){MessageBox.Show("Another OBS Bridge process is already running. Close the old portable Bridge before starting this software to avoid conflicting tally updates.","Bridge already running",MessageBoxButtons.OK,MessageBoxIcon.Warning);Append("Another Bridge process is active; startup blocked.");return;}}catch{}
            }
            if(config==null){MessageBox.Show("Configure your OBS connection before starting.");Configure();if(config==null)return;}
            if (!File.Exists(Program.StateFile) && String.IsNullOrEmpty(registration))
            { Append("This PC needs a registration code."); Register(); return; }
            try
            {
                string pass=Program.Decode(config.encryptedPassword);
                ProcessStartInfo si=new ProcessStartInfo(Program.Runner);
                si.Arguments="\""+Program.Script+"\"";
                si.WorkingDirectory=Program.AppFolder;si.UseShellExecute=false;si.CreateNoWindow=true;
                si.RedirectStandardOutput=true;si.RedirectStandardError=true;
                si.EnvironmentVariables["SUPABASE_URL"]=Program.CloudUrl;
                si.EnvironmentVariables["OBS_URL"]=config.obsUrl;
                si.EnvironmentVariables["OBS_PASSWORD"]=pass;
                si.EnvironmentVariables["BRIDGE_CONFIG_PATH"]=Program.StateFile;
                if(!String.IsNullOrEmpty(registration))si.EnvironmentVariables["BRIDGE_REGISTRATION_CODE"]=registration;
                pass=null;
                bridge=new Process();bridge.StartInfo=si;bridge.EnableRaisingEvents=true;
                bridge.OutputDataReceived+=delegate(object s,DataReceivedEventArgs e){if(e.Data!=null)Append(e.Data);};
                bridge.ErrorDataReceived+=delegate(object s,DataReceivedEventArgs e){if(e.Data!=null)Append(e.Data);};
                bridge.Exited+=delegate{if(!IsDisposed&&IsHandleCreated)BeginInvoke(new Action(OnExit));};
                if(!bridge.Start())throw new Exception("Windows could not start the Bridge runtime.");
                bridge.BeginOutputReadLine();bridge.BeginErrorReadLine();
                bridgeValue.Text="RUNNING";bridgeValue.ForeColor=Color.FromArgb(24,220,119);
                obsValue.Text="CONNECTING";obsValue.ForeColor=Program.Cyan;
                cloudValue.Text="CONNECTING";cloudValue.ForeColor=Program.Cyan;
                Append("Bridge launched. OBS can be started before or after this application.");UpdateButtons();
            }catch(Exception e){Append("Cannot start Bridge: "+e.Message);MessageBox.Show(e.Message,"Bridge start failed");bridgeValue.Text="ERROR";bridgeValue.ForeColor=Color.OrangeRed;}
        }
        void OnExit()
        {
            int exit=-1;try{if(bridge!=null)exit=bridge.ExitCode;}catch{}
            bridgeValue.Text="STOPPED";bridgeValue.ForeColor=Program.Muted;
            obsValue.Text="NOT CONNECTED";obsValue.ForeColor=Program.Muted;
            cloudValue.Text="NOT CONNECTED";cloudValue.ForeColor=Program.Muted;
            Append("Bridge stopped (exit code "+exit+"). "+(exit!=0&&!stopping?"Review log and check PC registration.":""));
            UpdateButtons();
        }
        void StopBridge()
        {
            stopping=true;
            if(bridge!=null){try{if(!bridge.HasExited){bridge.Kill();bridge.WaitForExit(2000);}}catch{}try{bridge.Dispose();}catch{}bridge=null;}
            bridgeValue.Text="STOPPED";bridgeValue.ForeColor=Program.Muted;
            obsValue.Text="NOT CONNECTED";obsValue.ForeColor=Program.Muted;
            cloudValue.Text="NOT CONNECTED";cloudValue.ForeColor=Program.Muted;
            UpdateButtons();stopping=false;
        }
        void Configure()
        {
            using(SettingsWindow dlg=new SettingsWindow(config))
            {
                if(dlg.ShowDialog(this)!=DialogResult.OK)return;
                bool restart=bridge!=null&&!bridge.HasExited;
                if(restart)StopBridge();
                config=new Connection();config.obsUrl=dlg.Url;config.encryptedPassword=Program.Encode(dlg.Password);config.version=2;
                Program.SafeSave(config);
                Append("OBS settings saved locally. Password encrypted with Windows DPAPI.");
                if(restart)StartBridge(null);
            }
        }
        void Register()
        {
            if(config==null){Configure();if(config==null)return;}
            bool existed=File.Exists(Program.StateFile);
            if(existed){DialogResult confirm=MessageBox.Show("Register a replacement PC for this production? The previously registered Bridge will be revoked once the new code succeeds.","Replace PC Bridge",MessageBoxButtons.YesNo,MessageBoxIcon.Warning);if(confirm!=DialogResult.Yes)return;}
            using(RegistrationWindow dlg=new RegistrationWindow())
            {
                if(dlg.ShowDialog(this)!=DialogResult.OK)return;
                StopBridge();
                if(existed){try{File.Delete(Program.StateFile);}catch(Exception e){MessageBox.Show("Unable to reset registration: "+e.Message);return;}}
                Append("Registering this PC. Your director's existing production mappings remain in Supabase.");
                StartBridge(dlg.Code);
            }
        }
        void ToggleStartup()
        {
            try{bool next=!Program.AutoStartEnabled();Program.SetAutoStart(next);UpdateButtons();Append(next?"Start with Windows sign-in enabled.":"Start with Windows sign-in disabled.");}
            catch(Exception e){MessageBox.Show("Could not change startup settings: "+e.Message);}
        }
        void CheckPort()
        {
            if(config==null){MessageBox.Show("Configure your OBS WebSocket address first.");return;}
            try
            {
                Uri u=new Uri(config.obsUrl);using(TcpClient c=new TcpClient())
                {
                    IAsyncResult a=c.BeginConnect(u.Host,u.Port,null,null);
                    if(!a.AsyncWaitHandle.WaitOne(2300))throw new Exception("Port did not respond. Open OBS and enable WebSocket Server.");
                    c.EndConnect(a);
                }
                MessageBox.Show("OBS WebSocket TCP port is reachable. Authentication is verified when you start the Bridge.","Port check",MessageBoxButtons.OK,MessageBoxIcon.Information);
            }catch(Exception e){MessageBox.Show("Cannot reach OBS WebSocket port. "+e.Message,"Port check",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
        }
    }
}
