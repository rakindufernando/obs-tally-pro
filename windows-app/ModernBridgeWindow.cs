using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;

namespace BumbiTally
{
    internal sealed class BumbiSplashV2 : Form
    {
        System.Windows.Forms.Timer timer;
        int step=0;
        public BumbiSplashV2()
        {
            Width=670;Height=390;StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.None;
            BackColor=ModernBridgeWindow.BG;ShowInTaskbar=false;TopMost=true;Opacity=0.96;
            var accent=new Panel{BackColor=ModernBridgeWindow.ACCENT,Dock=DockStyle.Top,Height=5};Controls.Add(accent);
            var logo=ModernBridgeWindow.BrandPicture(82,65,506,138); Controls.Add(logo);
            var software=ModernBridgeWindow.L("OBS TALLY PRO",80,223,510,45,26,true,Color.White);software.TextAlign=ContentAlignment.MiddleCenter;Controls.Add(software);
            var publisher=ModernBridgeWindow.L("BUMBI SOFTWARE SOLUTIONS",80,271,510,26,11,true,ModernBridgeWindow.ACCENT);publisher.TextAlign=ContentAlignment.MiddleCenter;Controls.Add(publisher);
            var foot=ModernBridgeWindow.L("Developed by BUMBI Software Solutions",80,336,510,22,9,false,ModernBridgeWindow.MUTED);foot.TextAlign=ContentAlignment.MiddleCenter;Controls.Add(foot);
            timer=new System.Windows.Forms.Timer();timer.Interval=35;timer.Tick+=(s,e)=>{step++; if(step>20){timer.Stop();Close();} };Shown+=(s,e)=>timer.Start();
        }
        protected override void Dispose(bool disposing){if(disposing&&timer!=null)timer.Dispose();base.Dispose(disposing);}
    }

    internal sealed class ModernBridgeWindow : Form
    {
        public static readonly Color BG=Color.FromArgb(6,8,13);
        public static readonly Color PANEL=Color.FromArgb(15,19,27);
        public static readonly Color PANEL2=Color.FromArgb(22,28,38);
        public static readonly Color BORDER=Color.FromArgb(43,51,65);
        public static readonly Color MUTED=Color.FromArgb(151,161,177);
        public static readonly Color ACCENT=Color.FromArgb(53,224,184);
        public static readonly Color CYAN=Color.FromArgb(79,192,255);
        public static readonly Color RED=Color.FromArgb(255,94,112);
        public static readonly Color YELLOW=Color.FromArgb(255,183,89);
        public static readonly string StatusFile=Path.Combine(Program.UserFolder,"obs-status.json");
        const string Site="https://rakindufernando.github.io/obs-tally-pro/";
        Process bridge;
        Connection config;
        NotifyIcon tray;
        System.Windows.Forms.Timer timer;
        Panel content,workspace,navPane,headPane,mainStatus,statsPane,settingsPane,logPane,aboutPane;
        Label bridgeStatus,obsStatus,cloudStatus,regStatus,programScene,previewScene,streamTime,recordTime,cpuValue,fpsValue,memValue,droppedValue,freeSpace,sourceCount,runMode,topMessage,clockLabel;
        RichTextBox log;
        Button goButton,stopButton,quitButton,autostartButton;
        int logLines;
        bool stopping,quitRequested;
        string lastObsMessage="";
        public bool HasShutdownControl {get{return quitButton!=null;}}

        public static Label L(string value,int x,int y,int width,int height,float size,bool bold,Color color)
        {
            var result=new Label();result.Text=value;result.SetBounds(x,y,width,height);result.ForeColor=color;
            result.Font=new Font("Segoe UI",size,bold?FontStyle.Bold:FontStyle.Regular);result.TextAlign=ContentAlignment.MiddleLeft;
            return result;
        }
        public static PictureBox BrandPicture(int x,int y,int w,int h)
        {
            var box=new PictureBox();box.SetBounds(x,y,w,h);box.BackColor=Color.White;box.SizeMode=PictureBoxSizeMode.Zoom;
            var p=Path.Combine(Program.AppFolder,"bumbi-logo.png");if(File.Exists(p))box.Image=Image.FromFile(p);
            return box;
        }
        static Button B(string label,Color back,Color fore,int height=44)
        {
            var b=new Button();b.Text=label;b.Height=height;b.Font=new Font("Segoe UI",10,FontStyle.Bold);
            b.BackColor=back;b.ForeColor=fore;b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderSize=0;b.Cursor=Cursors.Hand;
            var original=back;b.MouseEnter+=(s,e)=>{b.BackColor=ControlPaint.Light(original,0.18f);};b.MouseLeave+=(s,e)=>{b.BackColor=original;};
            return b;
        }
        static Panel Card(int x,int y,int w,int h,Control parent)
        {
            var panel=new Panel();panel.SetBounds(x,y,w,h);panel.BackColor=PANEL;parent.Controls.Add(panel);
            panel.Paint+=(s,e)=>{using(var pen=new Pen(BORDER))e.Graphics.DrawRectangle(pen,0,0,panel.Width-1,panel.Height-1);};
            return panel;
        }
        static string PrettyMs(long milliseconds)
        {
            if(milliseconds<0)milliseconds=0;var d=TimeSpan.FromMilliseconds(milliseconds);
            return ((int)d.TotalHours).ToString("00")+":"+d.Minutes.ToString("00")+":"+d.Seconds.ToString("00");
        }
        static object JsonValue(object obj,params string[] keys)
        {
            foreach(var key in keys){var dict=obj as IDictionary;if(dict==null||!dict.Contains(key))return null;obj=dict[key];}
            return obj;
        }
        static double Num(object obj)
        {
            if(obj==null)return 0;double d;return double.TryParse(Convert.ToString(obj,System.Globalization.CultureInfo.InvariantCulture),System.Globalization.NumberStyles.Any,System.Globalization.CultureInfo.InvariantCulture,out d)?d:0;
        }
        static string Str(object obj,string fallback="—") {return obj==null?fallback:Convert.ToString(obj);}
        static bool IsTrue(object value){return value is bool && (bool)value;}
        static string StatText(double v,string unit,int decimals=1){return v.ToString("F"+decimals,System.Globalization.CultureInfo.InvariantCulture)+unit;}
        public ModernBridgeWindow()
        {
            Text="OBS TALLY PRO 3.1.2 | BUMBI Software Solutions";
            Width=1250;Height=815;MinimumSize=new Size(1060,700);StartPosition=FormStartPosition.CenterScreen;
            BackColor=BG;ForeColor=Color.White;DoubleBuffered=true;
            try{Icon=new Icon(Path.Combine(Program.AppFolder,"bumbi.ico"));}catch{}
            BuildLayout();
            Load+=(s,e)=>InitializeBridge();
            FormClosing+=(s,e)=>{quitRequested=true;StopBridge();if(tray!=null){tray.Visible=false;tray.Dispose();tray=null;}if(timer!=null){timer.Stop();timer.Dispose();timer=null;}};
        }
        void BuildLayout()
        {
            // Navigation deliberately docks separately from the content so scaling never hides Exit.
            navPane=new Panel{Dock=DockStyle.Left,Width=228,BackColor=Color.FromArgb(9,12,19)};Controls.Add(navPane);
            var logo=BrandPicture(22,22,184,75);navPane.Controls.Add(logo);
            navPane.Controls.Add(L("BROADCAST OPERATIONS",22,110,190,20,8,true,MUTED));
            int top=157;
            AddNav("OVERVIEW",top,()=>ShowPane(mainStatus));top+=52;
            AddNav("OBS STATISTICS",top,()=>ShowPane(statsPane));top+=52;
            AddNav("CAMERAS & SOURCES",top,()=>ShowPane(settingsPane));top+=52;
            AddNav("DIAGNOSTICS & LOGS",top,()=>ShowPane(logPane));top+=52;
            AddNav("ABOUT / HELP",top,()=>ShowPane(aboutPane));
            var sideFooter=L("DEVELOPED BY\nBUMBI SOFTWARE SOLUTIONS",20,633,194,45,9,true,MUTED);
            sideFooter.Anchor=AnchorStyles.Left|AnchorStyles.Bottom;navPane.Controls.Add(sideFooter);
            var sideStop=B("STOP ALL & EXIT",Color.FromArgb(97,30,45),Color.White,48);
            sideStop.SetBounds(16,688,196,48);sideStop.Anchor=AnchorStyles.Left|AnchorStyles.Bottom;sideStop.Click+=(s,e)=>FullExit();navPane.Controls.Add(sideStop);quitButton=sideStop;

            workspace=new Panel{Dock=DockStyle.Fill,BackColor=BG};Controls.Add(workspace);workspace.BringToFront();
            headPane=new Panel{Dock=DockStyle.Top,Height=129,BackColor=BG};workspace.Controls.Add(headPane);
            headPane.Controls.Add(L("PRODUCTION CONTROL CENTER",30,18,800,21,10,true,ACCENT));
            headPane.Controls.Add(L("OBS TALLY PRO",28,40,700,50,29,true,Color.White));
            topMessage=L("Connected production monitoring · Secure local OBS bridge",30,91,780,23,10,false,MUTED);headPane.Controls.Add(topMessage);
            clockLabel=L("",775,39,192,35,12,true,MUTED);clockLabel.TextAlign=ContentAlignment.MiddleRight;clockLabel.Anchor=AnchorStyles.Top|AnchorStyles.Right;headPane.Controls.Add(clockLabel);
            content=new Panel{Dock=DockStyle.Fill,BackColor=BG};workspace.Controls.Add(content);content.BringToFront();
            mainStatus=Pane();statsPane=Pane();settingsPane=Pane();logPane=Pane();aboutPane=Pane();
            BuildOverview();BuildStatistics();BuildCameraTools();BuildDiagnostics();BuildAbout();ShowPane(mainStatus);
            timer=new System.Windows.Forms.Timer();timer.Interval=1000;timer.Tick+=(s,e)=>{clockLabel.Text=DateTime.Now.ToString("ddd  dd MMM   HH:mm:ss");UpdateStatus();};timer.Start();
        }
        Panel Pane()
        {
            var p=new Panel{Dock=DockStyle.Fill,BackColor=BG,AutoScroll=true,Visible=false};content.Controls.Add(p);return p;
        }
        void AddNav(string label,int y,Action action)
        {
            var b=B("   "+label,Color.FromArgb(15,20,28),Color.FromArgb(206,221,236),42);
            b.TextAlign=ContentAlignment.MiddleLeft;b.SetBounds(12,y,205,43);b.Click+=(s,e)=>action();navPane.Controls.Add(b);
        }
        void ShowPane(Panel selected)
        {
            foreach(Control child in content.Controls)if(child is Panel)child.Visible=(child==selected);
            selected.BringToFront();
        }
        void AddCaption(Control parent,string title,int y)
        {
            parent.Controls.Add(L(title,22,y,850,30,15,true,Color.White));
        }
        void BuildOverview()
        {
            var heading=L("Streaming PC connection",24,18,800,32,19,true,Color.White);mainStatus.Controls.Add(heading);
            mainStatus.Controls.Add(L("Run the Bridge locally on the same computer as OBS Studio.",25,53,900,23,10,false,MUTED));
            var a=StatusPanel(mainStatus,24,94,"BRIDGE",out bridgeStatus);
            var b=StatusPanel(mainStatus,336,94,"OBS WEBSOCKET",out obsStatus);
            var c=StatusPanel(mainStatus,648,94,"SUPABASE CLOUD",out cloudStatus);
            var details=Card(24,216,936,140,mainStatus);
            regStatus=L("PAIRING STATUS  ·  Not registered",20,18,850,27,11,true,MUTED);details.Controls.Add(regStatus);
            programScene=L("PROGRAM  ·  —",20,57,430,35,13,true,RED);details.Controls.Add(programScene);
            previewScene=L("PREVIEW  ·  —",486,57,425,35,13,true,ACCENT);details.Controls.Add(previewScene);
            var action=Card(24,374,936,167,mainStatus);
            action.Controls.Add(L("PRODUCTION CONTROLS",20,13,860,29,13,true,Color.White));
            goButton=B("START BRIDGE",ACCENT,Color.Black,52);goButton.SetBounds(20,57,197,52);goButton.Click+=(s,e)=>StartBridge(null);action.Controls.Add(goButton);
            stopButton=B("STOP BRIDGE",Color.FromArgb(105,39,54),Color.White,52);stopButton.SetBounds(226,57,170,52);stopButton.Click+=(s,e)=>StopBridge();action.Controls.Add(stopButton);
            var open=B("OPEN DASHBOARD",PANEL2,Color.White,52);open.SetBounds(405,57,202,52);open.Click+=(s,e)=>Open("#/dashboard");action.Controls.Add(open);
            var camera=B("ADD CAMERA",PANEL2,Color.White,52);camera.SetBounds(617,57,151,52);camera.Click+=(s,e)=>Open("#/cameras");action.Controls.Add(camera);
            var trayButton=B("TO TRAY",PANEL2,Color.White,52);trayButton.SetBounds(778,57,136,52);trayButton.Click+=(s,e)=>{Hide();Log("Minimized to tray. To stop all background operations choose STOP ALL & EXIT.");};action.Controls.Add(trayButton);
            var obsSettings=B("OBS CONNECTION SETTINGS",PANEL2,Color.White,34);obsSettings.SetBounds(20,122,286,34);obsSettings.Click+=(s,e)=>Configure();action.Controls.Add(obsSettings);
            var testPort=B("TEST OBS PORT",PANEL2,Color.White,34);testPort.SetBounds(320,122,225,34);testPort.Click+=(s,e)=>CheckPort();action.Controls.Add(testPort);
            runMode=L("Live tally status is calculated from OBS, not simulated.",25,555,920,26,10,false,MUTED);mainStatus.Controls.Add(runMode);
            mainStatus.Controls.Add(L(Program.Developer,25,600,910,25,9,true,MUTED));
        }
        Panel StatusPanel(Control parent,int x,int y,string title,out Label value)
        {
            var p=Card(x,y,295,105,parent);p.Controls.Add(L(title,18,12,260,23,9,true,MUTED));
            value=L("NOT CONNECTED",18,42,260,36,18,true,Color.White);p.Controls.Add(value);return p;
        }
        void BuildStatistics()
        {
            AddCaption(statsPane,"Live OBS performance",18);
            statsPane.Controls.Add(L("Metrics come from OBS WebSocket. Stale readings are hidden automatically.",22,52,935,25,10,false,MUTED));
            var a=Card(24,93,452,133,statsPane);
            a.Controls.Add(L("STREAMING TIME",18,13,400,25,10,true,MUTED));streamTime=L("00:00:00",18,42,410,70,33,true,RED);a.Controls.Add(streamTime);
            var b=Card(491,93,452,133,statsPane);
            b.Controls.Add(L("RECORDING TIME",18,13,400,25,10,true,MUTED));recordTime=L("00:00:00",18,42,410,70,33,true,ACCENT);b.Controls.Add(recordTime);
            var labels=new[]{"OBS CPU","RENDERED FPS","MEMORY USAGE","SKIPPED FRAMES","FREE DISK","OBS SOURCES"};
            var vals=new Label[6];for(int i=0;i<6;i++){
                int col=i%3,row=i/3;var card=Card(24+col*312,245+row*141,296,127,statsPane);
                card.Controls.Add(L(labels[i],17,13,265,23,10,true,MUTED));vals[i]=L("—",17,43,267,63,25,true,Color.White);card.Controls.Add(vals[i]);
            }
            cpuValue=vals[0];fpsValue=vals[1];memValue=vals[2];droppedValue=vals[3];freeSpace=vals[4];sourceCount=vals[5];
            statsPane.Controls.Add(L("Streaming bitrate, dropped frames, disk and FPS reflect the connected OBS PC.",24,551,900,26,10,false,MUTED));
            var update=B("REFRESH STATISTICS",PANEL2,Color.White,44);update.SetBounds(24,596,230,44);update.Click+=(s,e)=>UpdateStatus();statsPane.Controls.Add(update);
            statsPane.Controls.Add(L(Program.Developer,24,659,900,24,9,true,MUTED));
        }
        void BuildCameraTools()
        {
            AddCaption(settingsPane,"Camera setup without guesswork",18);
            settingsPane.Controls.Add(L("Select your actual OBS sources from the online setup wizard, then assign a cameraman.",24,54,916,26,10,false,MUTED));
            string[] steps={"1   Open OBS and connect this Bridge.","2   In CAMERA SETUP select Add Camera and choose a source.","3   Select a scene or input detected from OBS automatically.","4   Save the camera and pair its phone with a QR link."};
            var stepCard=Card(24,102,937,206,settingsPane);
            for(int i=0;i<steps.Length;i++)stepCard.Controls.Add(L(steps[i],22,17+i*45,882,35,12,i==0,Color.White));
            var a=B("ADD / EDIT CAMERAS",ACCENT,Color.Black,53);a.SetBounds(24,329,275,53);a.Click+=(s,e)=>Open("#/cameras");settingsPane.Controls.Add(a);
            var b=B("OBS SOURCE MAPPINGS",PANEL2,Color.White,53);b.SetBounds(311,329,275,53);b.Click+=(s,e)=>Open("#/mapping");settingsPane.Controls.Add(b);
            var c=B("PHONE PAIRING",PANEL2,Color.White,53);c.SetBounds(598,329,280,53);c.Click+=(s,e)=>Open("#/devices");settingsPane.Controls.Add(c);
            settingsPane.Controls.Add(L("Other streaming computer? Install this program there, connect OBS, then register it using a new director code.",24,408,927,56,11,false,MUTED));
            var register=B("REGISTER / MOVE THIS PC",PANEL2,Color.White,50);register.SetBounds(24,488,298,50);register.Click+=(s,e)=>Register();settingsPane.Controls.Add(register);
            var setting=B("OBS CONNECTION SETTINGS",PANEL2,Color.White,50);setting.SetBounds(335,488,286,50);setting.Click+=(s,e)=>Configure();settingsPane.Controls.Add(setting);
            settingsPane.Controls.Add(L(Program.Developer,24,615,920,25,9,true,MUTED));
        }
        void BuildDiagnostics()
        {
            AddCaption(logPane,"Connection diagnostics",18);
            var tests=B("TEST OBS PORT",PANEL2,Color.White,43);tests.SetBounds(24,64,208,43);tests.Click+=(s,e)=>CheckPort();logPane.Controls.Add(tests);
            var web=B("OPEN DIRECTOR",PANEL2,Color.White,43);web.SetBounds(244,64,207,43);web.Click+=(s,e)=>Open("#/dashboard");logPane.Controls.Add(web);
            var clear=B("CLEAR LOG",PANEL2,Color.White,43);clear.SetBounds(463,64,166,43);clear.Click+=(s,e)=>{log.Clear();logLines=0;};logPane.Controls.Add(clear);
            autostartButton=B(Program.AutoStartEnabled()?"START WITH WINDOWS   ON":"START WITH WINDOWS   OFF",PANEL2,Color.White,43);autostartButton.SetBounds(644,64,292,43);
            autostartButton.Click+=(s,e)=>{try{bool state=!Program.AutoStartEnabled();Program.SetAutoStart(state);autostartButton.Text=state?"START WITH WINDOWS   ON":"START WITH WINDOWS   OFF";Log(state?"Automatic startup enabled for this Windows user.":"Automatic startup disabled.");}catch(Exception ex){MessageBox.Show(ex.Message,"Startup setting failed");}};logPane.Controls.Add(autostartButton);
            var panel=Card(24,127,936,427,logPane);
            log=new RichTextBox();log.SetBounds(12,12,912,400);log.BackColor=Color.FromArgb(8,11,17);log.ForeColor=Color.FromArgb(204,220,233);log.Font=new Font("Consolas",9.5f);log.ReadOnly=true;log.BorderStyle=BorderStyle.None;log.ScrollBars=RichTextBoxScrollBars.Vertical;panel.Controls.Add(log);
            logPane.Controls.Add(L("Never share your OBS password or Bridge registration token in a screenshot.",24,565,920,32,10,false,YELLOW));
            logPane.Controls.Add(L(Program.Developer,24,630,920,26,9,true,MUTED));
        }
        void BuildAbout()
        {
            AddCaption(aboutPane,"BUMBI Software Solutions",18);
            var card=Card(24,72,936,360,aboutPane);
            var mark=BrandPicture(95,35,744,174);mark.BackColor=Color.White;card.Controls.Add(mark);
            var name=L("OBS TALLY PRO 3.1.2",100,228,735,49,24,true,Color.White);name.TextAlign=ContentAlignment.MiddleCenter;card.Controls.Add(name);
            var info=L("Made for reliable multi-camera broadcast productions",100,286,735,30,11,false,MUTED);info.TextAlign=ContentAlignment.MiddleCenter;card.Controls.Add(info);
            var help=B("OPEN ONLINE DASHBOARD",ACCENT,Color.Black,51);help.SetBounds(24,466,290,51);help.Click+=(s,e)=>Open("#/dashboard");aboutPane.Controls.Add(help);
            var github=B("VIEW PROJECT SOURCE",PANEL2,Color.White,51);github.SetBounds(328,466,275,51);github.Click+=(s,e)=>OpenExternal("https://github.com/rakindufernando/obs-tally-pro");aboutPane.Controls.Add(github);
            var share=B("SHARE SOFTWARE",PANEL2,Color.White,51);share.SetBounds(620,466,245,51);share.Click+=(s,e)=>ShareSoftware();aboutPane.Controls.Add(share);
            aboutPane.Controls.Add(L(Program.Developer,24,607,920,25,10,true,MUTED));
        }
        void ShareSoftware(){
            try{
                string configFile=Path.Combine(Program.UserFolder,"verified-installer-url.txt");
                if(!File.Exists(configFile)){
                    MessageBox.Show("A separately hosted and verified HTTPS installer link has not been configured. No unverified download link will be shared.","Software sharing not configured",MessageBoxButtons.OK,MessageBoxIcon.Information);
                    return;
                }
                string url=File.ReadAllText(configFile).Trim();
                Uri parsed;
                if(!Uri.TryCreate(url,UriKind.Absolute,out parsed)||parsed.Scheme!=Uri.UriSchemeHttps||parsed.UserInfo.Length>0){
                    MessageBox.Show("The installer link must be a verified HTTPS address.","Invalid installer link");return;
                }
                Clipboard.SetText(url);
                MessageBox.Show("Installer URL copied to clipboard. Check the public file checksum before sharing.","Software link copied");
            }catch(Exception e){MessageBox.Show(e.Message,"Share Software");}
        }
        void Open(string route){OpenExternal(Site+route);}
        void OpenExternal(string url){try{Process.Start(url);}catch(Exception e){MessageBox.Show("Could not open browser. "+e.Message);}}
        void InitializeBridge()
        {
            try{
                tray=new NotifyIcon();tray.Icon=Icon;tray.Text="BUMBI OBS TALLY PRO 3.1.2.2";tray.Visible=true;
                var ctx=new ContextMenu();ctx.MenuItems.Add("Open control panel",(s,e)=>{Show();WindowState=FormWindowState.Normal;Activate();});
                ctx.MenuItems.Add("Stop Bridge",(s,e)=>StopBridge());
                ctx.MenuItems.Add("Stop all and Exit",(s,e)=>FullExit());tray.ContextMenu=ctx;
                tray.DoubleClick+=(s,e)=>{Show();WindowState=FormWindowState.Normal;Activate();};
            }catch(Exception e){Log("Tray unavailable: "+e.Message);}
            Log("BUMBI OBS TALLY PRO 3.1.2.2 ready. Closing the window stops the Bridge completely.");
            if(!File.Exists(Program.Runner)||!File.Exists(Program.Script)){
                MessageBox.Show("Bridge runtime missing. Please reinstall OBS TALLY PRO.","Repair required",MessageBoxButtons.OK,MessageBoxIcon.Error);return;
            }
            try{config=Program.ReadConnection();}catch(Exception e){Log("Cannot read saved settings: "+e.Message);}
            if(config==null){Log("First-run setup required. Enter OBS WebSocket settings.");Configure();}
            if(config!=null&&File.Exists(Program.StateFile))StartBridge(null);
            else if(config!=null)Log("Click REGISTER / MOVE THIS PC to pair with your production.");
            UpdateControls();
        }
        void Log(string message)
        {
            if(log==null||log.IsDisposed)return;
            if(log.InvokeRequired){try{log.BeginInvoke(new Action<string>(Log),message);}catch{}return;}
            log.AppendText(DateTime.Now.ToString("HH:mm:ss")+"   "+message+Environment.NewLine);
            if(++logLines>500){var lines=log.Lines;if(lines.Length>330){string[] tail=new string[330];Array.Copy(lines,lines.Length-330,tail,0,330);log.Lines=tail;logLines=330;}}
            log.SelectionStart=log.TextLength;log.ScrollToCaret();
            if(message.IndexOf("OBS WebSocket connected",StringComparison.OrdinalIgnoreCase)>=0)lastObsMessage="connected";
            if(message.IndexOf("OBS unavailable",StringComparison.OrdinalIgnoreCase)>=0||message.IndexOf("connection lost",StringComparison.OrdinalIgnoreCase)>=0)lastObsMessage="reconnecting";
        }
        void StartBridge(string registration)
        {
            if(bridge!=null&&!bridge.HasExited)return;
            if(config==null){Configure();if(config==null)return;}
            foreach(var proc in Process.GetProcessesByName("OBS-TALLY-PRO-Bridge")){
                try{if(!proc.HasExited){MessageBox.Show("Another Bridge runtime is still active, possibly from the old portable edition. Stop it first to avoid conflicting sessions.","Duplicate Bridge",MessageBoxButtons.OK,MessageBoxIcon.Warning);return;}}catch{}
                finally{proc.Dispose();}
            }
            if(!File.Exists(Program.StateFile)&&string.IsNullOrEmpty(registration)){Register();return;}
            try{
                var start=new ProcessStartInfo(Program.Runner);
                start.Arguments="\""+Program.Script+"\"";start.WorkingDirectory=Program.AppFolder;start.UseShellExecute=false;start.CreateNoWindow=true;
                start.RedirectStandardOutput=true;start.RedirectStandardError=true;
                start.EnvironmentVariables["SUPABASE_URL"]=Program.CloudUrl;
                start.EnvironmentVariables["OBS_URL"]=config.obsUrl;
                start.EnvironmentVariables["OBS_PASSWORD"]=Program.Decode(config.encryptedPassword);
                start.EnvironmentVariables["BRIDGE_CONFIG_PATH"]=Program.StateFile;
                start.EnvironmentVariables["BRIDGE_STATUS_PATH"]=StatusFile;
                if(!string.IsNullOrEmpty(registration))start.EnvironmentVariables["BRIDGE_REGISTRATION_CODE"]=registration;
                var child=new Process();child.StartInfo=start;child.EnableRaisingEvents=true;
                child.OutputDataReceived+=(s,e)=>{if(e.Data!=null)Log(e.Data);};
                child.ErrorDataReceived+=(s,e)=>{if(e.Data!=null)Log(e.Data);};
                child.Exited+=(s,e)=>{try{if(IsHandleCreated&&!IsDisposed)BeginInvoke(new Action(OnProcessExited));}catch{}};
                if(!child.Start())throw new Exception("Windows could not start the Bridge.");
                bridge=child;child.BeginOutputReadLine();child.BeginErrorReadLine();
                lastObsMessage="reconnecting";Log("Secure OBS Bridge started. Waiting for OBS and Supabase.");UpdateControls();
            }catch(Exception e){Log("Start failure: "+e.Message);MessageBox.Show(e.Message,"Could not start the Bridge",MessageBoxButtons.OK,MessageBoxIcon.Error);}
        }
        void OnProcessExited(){if(stopping||quitRequested)return;Log("Bridge process exited. Check credentials, connectivity, and registration before restarting.");bridgeStatus.Text="STOPPED";UpdateControls();}
        void StopBridge()
        {
            stopping=true;
            var p=bridge;bridge=null;
            if(p!=null){try{if(!p.HasExited){p.Kill();p.WaitForExit(3500);}}catch{}finally{p.Dispose();}}
            try{if(File.Exists(StatusFile))File.Delete(StatusFile);}catch{}
            lastObsMessage="";stopping=false;UpdateControls();
            if(!quitRequested)Log("Bridge stopped. Local OBS cloud synchronization ended.");
        }
        void FullExit()
        {
            quitRequested=true;StopBridge();Close();
        }
        void Configure()
        {
            using(var dialog=new SettingsWindow(config)){
                if(dialog.ShowDialog(this)!=DialogResult.OK)return;
                bool restart=bridge!=null&&!bridge.HasExited;if(restart)StopBridge();
                config=new Connection{obsUrl=dialog.Url,encryptedPassword=Program.Encode(dialog.Password),version=3};
                Program.SafeSave(config);Log("OBS URL and encrypted password saved for this Windows user.");
                if(restart)StartBridge(null);
            }
        }
        void Register()
        {
            if(config==null){Configure();if(config==null)return;}
            using(var dialog=new RegistrationWindow()){
                if(dialog.ShowDialog(this)!=DialogResult.OK)return;
                bool existed=File.Exists(Program.StateFile);
                if(existed&&MessageBox.Show("Registering a new Bridge for this production revokes the previous PC's token. Continue?","Move streaming PC",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
                StopBridge();
                try{if(existed){File.Copy(Program.StateFile,Program.StateFile+".backup",true);File.Delete(Program.StateFile);}}
                catch(Exception e){MessageBox.Show("Could not reset old pairing. "+e.Message);return;}
                Log("Registering this Windows computer. Other production settings remain on the cloud.");
                StartBridge(dialog.Code);
            }
        }
        void CheckPort()
        {
            if(config==null){MessageBox.Show("Save OBS settings first.");return;}
            try{
                var uri=new Uri(config.obsUrl);using(var tcp=new TcpClient()){
                    var result=tcp.BeginConnect(uri.Host,uri.Port,null,null);
                    if(!result.AsyncWaitHandle.WaitOne(2000))throw new Exception("Port did not answer. Check OBS Tools → WebSocket Server Settings.");
                    tcp.EndConnect(result);
                }
                MessageBox.Show("OBS WebSocket port is reachable. Start the Bridge to verify authentication.","Port check",MessageBoxButtons.OK,MessageBoxIcon.Information);
            }catch(Exception e){MessageBox.Show("OBS port check failed. "+e.Message,"Connection test",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
        }
        void UpdateControls()
        {
            if(IsDisposed)return;
            bool running=bridge!=null&&!bridge.HasExited;
            if(goButton!=null)goButton.Enabled=!running;
            if(stopButton!=null)stopButton.Enabled=running;
            if(bridgeStatus!=null){bridgeStatus.Text=running?"RUNNING":"STOPPED";bridgeStatus.ForeColor=running?ACCENT:MUTED;}
            if(regStatus!=null)regStatus.Text=File.Exists(Program.StateFile)?"PAIRING STATUS  ·  REGISTERED":"PAIRING STATUS  ·  NOT REGISTERED";
        }
        void UpdateStatus()
        {
            UpdateControls();
            bool fresh=false,connected=false,cloud=false,streaming=false,recording=false;
            string connectionIssue="";
            long streamMs=0,recordMs=0;
            if(File.Exists(StatusFile))try{
                var file=File.ReadAllText(StatusFile,Encoding.UTF8);
                object data=new JavaScriptSerializer().DeserializeObject(file);
                DateTime at;string when=Str(JsonValue(data,"observed_at"),"");
                fresh=DateTime.TryParse(when,null,System.Globalization.DateTimeStyles.AdjustToUniversal|System.Globalization.DateTimeStyles.AssumeUniversal,out at)&&(DateTime.UtcNow-at.ToUniversalTime()).TotalSeconds<=15;
                if(fresh){
                    connected=IsTrue(JsonValue(data,"obs_connected"));cloud=IsTrue(JsonValue(data,"cloud_connected"));
                    connectionIssue=Str(JsonValue(data,"obs_error"),"");
                    streaming=IsTrue(JsonValue(data,"stream","active"));recording=IsTrue(JsonValue(data,"record","active"));
                    streamMs=(long)Num(JsonValue(data,"stream","duration_ms"));recordMs=(long)Num(JsonValue(data,"record","duration_ms"));
                    var extra=(long)Math.Max(0,(DateTime.UtcNow-at.ToUniversalTime()).TotalMilliseconds);
                    if(streaming)streamMs+=extra;if(recording)recordMs+=extra;
                    programScene.Text="PROGRAM  ·  "+Str(JsonValue(data,"program_scene"),"None");
                    previewScene.Text="PREVIEW  ·  "+Str(JsonValue(data,"preview_scene"),"None");
                    cpuValue.Text=StatText(Num(JsonValue(data,"stats","cpu_pct"))," %");
                    fpsValue.Text=StatText(Num(JsonValue(data,"stats","fps"))," fps");
                    memValue.Text=StatText(Num(JsonValue(data,"stats","memory_mb"))," MB",0);
                    droppedValue.Text=StatText(Num(JsonValue(data,"stats","render_skipped"))+Num(JsonValue(data,"stats","output_skipped")),"",0);
                    freeSpace.Text=StatText(Num(JsonValue(data,"stats","disk_gb"))," GB");
                    var sources=JsonValue(data,"sources") as System.Collections.IList;sourceCount.Text=sources!=null?sources.Count.ToString():"—";
                }
            }catch(Exception e){if(e.Message!=lastObsMessage){lastObsMessage=e.Message;Log("Status refresh unavailable: "+e.Message);}}
            obsStatus.Text=connected?"CONNECTED":(bridge!=null&&!bridge.HasExited?(connectionIssue.Length>0?"RETRYING":"CONNECTING"):"OFFLINE");obsStatus.ForeColor=connected?ACCENT:YELLOW;
            cloudStatus.Text=cloud?"SYNCHRONIZED":(bridge!=null&&!bridge.HasExited?"CONNECTING":"OFFLINE");cloudStatus.ForeColor=cloud?CYAN:YELLOW;
            streamTime.Text=streaming?PrettyMs(streamMs):"00:00:00";streamTime.ForeColor=streaming?RED:MUTED;
            recordTime.Text=recording?PrettyMs(recordMs):"00:00:00";recordTime.ForeColor=recording?ACCENT:MUTED;
            if(!fresh){programScene.Text="PROGRAM  ·  SIGNAL UNAVAILABLE";previewScene.Text="PREVIEW  ·  SIGNAL UNAVAILABLE";
                cpuValue.Text=fpsValue.Text=memValue.Text=droppedValue.Text=freeSpace.Text=sourceCount.Text="—";}
            runMode.Text=connected?"OBS synchronized. Program and Preview are updated securely.":
                (connectionIssue.Length>0?connectionIssue:"Open OBS Studio, enable WebSocket and check the address/password.");
            runMode.ForeColor=connected?ACCENT:YELLOW;
        }
    }
}