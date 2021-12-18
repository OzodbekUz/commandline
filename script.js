const VirtualTerminalIO = (()=>{

    let terminal ;
    let terminalWindow ;
    let terminalTitle ;

    function init(terminalSelector){
        terminal = document.querySelector(terminalSelector) ;
        if(!terminal)
            console.error("Данный селектор не соответствует ни одному элементу");
        terminalWindow = terminal.querySelector("#terminalWindow");
        terminalTitle  = terminal.querySelector("#terminalTitle");

        terminalWindow.addEventListener("click",()=>{
            let activestdin = terminalWindow.querySelector(`[contenteditable="true"]`);
            if(activestdin){
                activestdin.focus();
            }
        })
    }

    function printLine(message,badge="",wrapping=""){
        let line = document.createElement("div");
        line.classList.add("o-line");
        if(badge)
            line.innerHTML += `<span class="badge ${badge}">${badge}</span>` ;
        line.innerHTML += `<span class="message ${wrapping ? "pre-wrap" : ""}">${message}</span>` ;
        terminalWindow.append(line);
        return line;
    }

    function stdin(prompt=">"){
        let line = document.createElement("div");
        line.classList.add("i-line");
        line.innerHTML = `<span class="prompt">${prompt}</span>` ;
        let input = document.createElement("input");
        input.contentEditable = "true" ;
        input.type = "text" ;
        input.classList.add("stdin");
        let stdInputPromise = new Promise((resolve,reject) => {
            input.addEventListener("keydown",(e)=>{
                if(e.key == "Enter") {
                    e.preventDefault();
                    e.target.contentEditable = false ;
                    e.target.blur();  
                    resolve(e.target.value);
                }
            });
        });
        line.appendChild(input);
        terminalWindow.append(line);
        input.focus();
        return stdInputPromise ;
    }

    function stdout(output,wrapping=""){
        let line = printLine(output,"",wrapping);
        return line ;
    }

    function stderr(error){
        printLine(error,"error");
    }

    function stdinfo(info){
        printLine(info,"info");
    }

    function progress(duration = 5000,stepsize = 200,label=""){
        duration = parseInt(duration)
        stepsize = parseInt(stepsize)

        if(!duration) duration = 5000
        if(!stepsize) stepsize = duration/100
        let line = stdout(`${label} [....................] 0%`);
        let message = line.querySelector(".message");
        
        let step = 100 * stepsize / duration ;

        let progressComplete = new Promise((resolve) => {
            let v = 0 ;
            let clock = setInterval(() => {
                v += step ;
                let percentage = Math.floor(v);
                let h = Math.floor(v*20/100) ;
                let d = 20 - h; 
                message.innerText = `${label} [${"#".repeat(h)}${".".repeat(d)}] ${percentage}%`;
                if(v >= 100) {
                    clearInterval(clock);
                    message.innerText = `${label} [${"#".repeat(h)}${".".repeat(d)}] 100%` ;
                    resolve();
                }
            },stepsize)
            
        })

        return progressComplete ;
    }

    function clear(){
        terminalWindow.innerHTML = "" ;
    }

    function setTitle(title = "Виртуальный терминал") {
        terminalTitle.innerText = title ;
    }

    return {
        init,
        stderr,
        stdin,
        stdout,
        stdinfo,
        progress,
        clear,
        setTitle
    }
})();




const AsciiTable = (()=>{
    class table {
        constructor(){
            this.rows = []  ;
        }

        addRow(...row){
            this.rows.push(row);
        }

        getTable(){
            
            let colWidth = [] ;
            this.rows.forEach((row,r) => {
                row.forEach((col,c)=>{
                    if(!colWidth[c] || col.length > colWidth[c]) {
                        colWidth[c] = col.length ;
                        return;
                    }
                })
            });

            // draw horizontal divider
            let dividerH = "+" ;
            colWidth.forEach(len => {
                dividerH += "-".repeat(len+2) + "+" ;
            })

            let output = [`${dividerH}`]
            
            this.rows.forEach(row => {
                let formatedRow = "|" ;
                row.forEach((col,c) => {
                    formatedRow += " " + col.padEnd(colWidth[c]) + " |" ;
                })
                output.push(formatedRow);
                output.push(`${dividerH}`);
            });

            output.forEach(line => {
                VirtualTerminalIO.stdout(line,"pre");
            })
        }

        
    } 

    function createTable(){
        return new table();
    }

    return{
        createTable 
    }
})();


const VirtualTerminalShell = (()=>{   
    const IO = VirtualTerminalIO ;

    let shellPrompt = "ox@kodland: -$";
    const cmdList = {};
    const shell = {
        activateShell,
        registerProgram,
        IO,
        cmdList,
        sleep
    };

    function sleep(milliseconds) {
        const date = Date.now();
        let currentDate = null;
        do {
          currentDate = Date.now();
        } while (currentDate - date < milliseconds);
    }

    function registerProgram(cmd,cmdData){
        cmdList[cmd] = cmdData ;
    }

    async function exec(cmdline=""){
        let cleanCmd = cmdline.trim().replace(/\s\s+/g, " ").split(" ");
        let cmd = cleanCmd[0];
        let params = cleanCmd.slice(1);

        let programFinish = new Promise((resolve,reject) => {
            if(cmd in cmdList){
                cmdList[cmd].run(params,shell,resolve,reject);
            } else {
                IO.stderr(`'${cmd}' не распознается как внутренняя или внешняя команда`);
                resolve();
            }
        })
       
        return programFinish ;
    }
    
    async function activateShell(){
        for(;;){
            let cmdinp = IO.stdin(shellPrompt);
            let cmdline = await cmdinp ;
            if(cmdline)
                await exec(cmdline) ;
        }
    }
    
    return shell;
})();

VirtualTerminalShell.registerProgram("echo",{
    run : (params,shell,resolve,reject) => {
        shell.IO.stdout(params.join(" "))
        resolve();
    },
    doc : `отображает текст в командной строке`,
    syntax : `echo $message`
});

VirtualTerminalShell.registerProgram("help",{
    run : (params,shell,resolve,reject) => {
        if(params.length == 0) {
            let table = AsciiTable.createTable();
            table.addRow("Имя комманд","синтаксис команды");
            for(cmd in shell.cmdList){
                
                table.addRow(cmd,shell.cmdList[cmd].syntax);
            }
            let output = table.getTable();
        
        }
        params.forEach(param => {
            if(param in shell.cmdList){
                shell.IO.stdinfo(param);
                shell.IO.stdout(shell.cmdList[params].syntax);
                shell.IO.stdout(shell.cmdList[params].doc);
            } else {
                shell.IO.stderr(`${param} не распознается как внутренняя или внешняя команда`);
            }
        });
        resolve();
    },
    doc : `отображает текст в командной строке`,
    syntax : `help $cmd-name[optional]`
});

VirtualTerminalShell.registerProgram("info",{
    run : (params,shell,resolve,reject) => {
        shell.IO.stdinfo(params.join(" "))
        resolve();
    },
    doc : `отображает текст в командной строке`,
    syntax : `info $info-message`
});


VirtualTerminalShell.registerProgram("progress",{
    run : (params,shell,resolve) => {
        shell.IO.progress(params[0],params[1],params[2]).then(()=>{
            resolve();
        });
    },
    doc : `отображает текст в командной строке`,
    syntax : `progress $duration $update $lable `
});

VirtualTerminalShell.registerProgram("input",{
    run : (params,shell,resolve,reject) => {
        shell.IO.stdin(params[0]).then(()=>{
            resolve();
        });
    },
    doc : `отображает текст в командной строке`,
    syntax : `input $prompt`
});

VirtualTerminalShell.registerProgram("clear",{
    run : (params,shell,resolve,reject) => {
        shell.IO.clear();
        resolve();
    },
    doc : `отображает текст в командной строке`,
    syntax : `Очистка`
});

VirtualTerminalShell.registerProgram("title",{
    run : (params,shell,resolve,reject) => {
        shell.IO.setTitle(params.join(" "));
        resolve();
    },
    doc : `меняет название терминала`,
    syntax : `title %new-title%`
});

VirtualTerminalShell.registerProgram("jscli",{
    run :async (params,shell,resolve,reject) => {
        shell.IO.progress(1000,100,"Loading JS").then(async ()=>{
            shell.IO.stdinfo("Сессия JavaScript активна");
            shell.IO.stdout("Теперь вы можете использовать обычные JS-выражения в терминале. [try: 2 + 2] Введите exit, чтобы выйти");
            for(;;){
                let cmdinp = shell.IO.stdin(">>>");
                let cmdline = await cmdinp ;
                if(cmdline == "exit") {
                    resolve();
                    return ;
                }
                try{
                    let output = await eval(cmdline) ;
                    shell.IO.stdout(output);
                } catch(error) {
                    shell.IO.stderr(error);
                }
            }
        });
    },
    doc : `Запускает сеанс терминала JavaScript`,
    syntax : `jscli`
});



window.onload = () =>{
    VirtualTerminalIO.init("#virtual-terminal");
    VirtualTerminalShell.activateShell();
};
