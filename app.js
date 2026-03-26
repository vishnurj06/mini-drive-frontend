window.onload = () => {
  const token = localStorage.getItem("token");
  const urlParams = new URLSearchParams(window.location.search);
  const fileIdParam = urlParams.get('fileId');
  const folderIdParam = urlParams.get('folderId'); // 🔥 THE FIX: Grab folder URLs

  if (token) {
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        currentUser = { 
            email: payload.email, 
            username: payload.username || payload.email.split('@')[0],
            role: payload.role || 'user'
        };
        const welcomeEl = document.getElementById('welcomeMsg');
        if(welcomeEl) welcomeEl.textContent = `Hello, ${currentUser.username}`;

        if (fileIdParam) {
            handleSharedLink(fileIdParam);
        } else if (folderIdParam) {
            // 🔥 THE FIX: Open the shared folder automatically
            showView("dashboardView");
            openFolder(folderIdParam, "Shared Folder"); 
        } else {
            showView("dashboardView");
            renderBreadcrumbs();
            loadFiles();
        }
    } catch (e) {
        localStorage.removeItem("token");
        showView("authView");
    }
  } else {
    if (fileIdParam) sessionStorage.setItem("pendingSharedLink", fileIdParam);
    if (folderIdParam) sessionStorage.setItem("pendingSharedFolder", folderIdParam); // Save folder for after login
    showView("authView");
  }
};

// --- STATE ---
let authMode = 'login'; 
let currentUser = null;
const ADMIN_EMAIL = 'admin@gmail.com';
let currentFolderId = null;
let breadcrumbPath = [{ id: null, name: 'My Drive' }];
let currentShareFileId = null;

// --- HELPERS ---
function getFileType(fileName) {
    if (!fileName) return "file";
    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === "pdf") return "pdf";
    if (["ppt", "pptx"].includes(ext)) return "ppt";
    if (["doc", "docx"].includes(ext)) return "doc";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
    if (["mp4", "webm"].includes(ext)) return "video";
    if (["mp3", "wav", "m4a", "ogg", "aac"].includes(ext)) return "audio";
    return "file";
}

function getFileIcon(type) {
    switch(type) {
        case "pdf": return "📄";
        case "ppt": return "📊";
        case "doc": return "📝";
        case "image": return "🖼️";
        case "video": return "🎥";
        case "audio": return "🎵";
        default: return "📁";
    }
}

function showView(viewId) {
  document.querySelectorAll(".view-container").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
}

window.goBackToDashboard = () => {
    window.history.pushState({}, document.title, window.location.pathname);
    document.getElementById('fileViewContainer').classList.remove('active');
    document.getElementById('dashboardView').classList.add('active');
    loadFiles();
};

// --- AUTHENTICATION ---
window.toggleAuthMode = (mode) => {
    authMode = mode;
    const title = document.getElementById('authTitle');
    const btn = document.getElementById('authSubmitBtn');
    const toggleText = document.getElementById('authToggleText');
    const usernameGroup = document.getElementById('usernameGroup');
    const usernameInput = document.getElementById('usernameInput');

    if (mode === 'signup') {
        title.innerText = 'Create Account';
        btn.innerText = 'Sign Up';
        usernameGroup.classList.remove('hidden');
        usernameInput.required = true;
        toggleText.innerHTML = `Already have an account? <a onclick="toggleAuthMode('login')">Log in</a>`;
    } else {
        title.innerText = 'Login';
        btn.innerText = 'Login';
        usernameGroup.classList.add('hidden');
        usernameInput.required = false;
        toggleText.innerHTML = `Don't have an account? <a onclick="toggleAuthMode('signup')">Create one</a><br><br><a onclick="openForgotModal()" style="color: var(--text-secondary); font-weight: normal; cursor: pointer;">Forgot Password?</a>`;
    }
    document.getElementById('authError').innerText = '';
};

window.handleAuth = async (e) => {
  e.preventDefault();
  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  const username = document.getElementById('usernameInput').value.trim();

  // Strict Domain Validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
      return document.getElementById("authError").innerText = "Please enter a valid email address domain.";
  }

  try {
    if (authMode === "login") {
      await login(email, password);
    } else {
      if(!username) return document.getElementById("authError").innerText = "Username is required.";
      const res = await fetch("https://mini-drive-backend-ba55.onrender.com/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert("Signup successful! Now login.");
      toggleAuthMode('login'); 
    }
  } catch (err) {
    document.getElementById("authError").innerText = err.message;
  }
};

async function login(email, password) {
  const res = await fetch("https://mini-drive-backend-ba55.onrender.com/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();

  if (data.token) {
    localStorage.setItem("token", data.token);
    const payload = JSON.parse(atob(data.token.split(".")[1]));
    
    currentUser = { 
        email: payload.email, 
        username: payload.username || payload.email.split('@')[0],
        role: payload.role || 'user'
    };
    
    document.getElementById('welcomeMsg').textContent = `Hello, ${currentUser.username}`;

    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get('fileId') || sessionStorage.getItem("pendingSharedLink");
    const folderId = urlParams.get('folderId') || sessionStorage.getItem("pendingSharedFolder"); // 🔥 THE FIX

    if (fileId) {
        sessionStorage.removeItem("pendingSharedLink");
        handleSharedLink(fileId);
    } else if (folderId) {
        // 🔥 THE FIX: Jump straight into the folder after login
        sessionStorage.removeItem("pendingSharedFolder");
        showView("dashboardView");
        openFolder(folderId, "Shared Folder");
    } else {
        showView("dashboardView");
        renderBreadcrumbs();
        await loadFiles();
    }
  } else {
    throw new Error(data.error || "Login failed");
  }
}

window.logout = function() {
    // 1. Clear the digital ID
    localStorage.removeItem("token");
    currentUser = null;
    
    // 2. Reset navigation state so the next user starts at the root
    currentFolderId = null;
    breadcrumbPath = [{ id: null, name: 'My Drive' }];
    
    // 3. Force UI sections into hiding
    const adminSection = document.getElementById('adminSection');
    if (adminSection) adminSection.classList.add('hidden');
    
    const sharedDriveSection = document.getElementById("sharedDriveSection");
    if (sharedDriveSection) sharedDriveSection.classList.add('hidden');
    
    // 4. 🔥 THE FIX: Use your built-in showView function to switch pages!
    showView("authView");
};

// --- OTP & FORGOT PASSWORD LOGIC ---
window.openForgotModal = () => {
    document.getElementById('forgotPasswordModal').classList.add('active');
    document.getElementById('forgotStep1').classList.remove('hidden');
    document.getElementById('forgotStep2').classList.add('hidden');
};

window.closeForgotModal = () => {
    document.getElementById('forgotPasswordModal').classList.remove('active');
    document.getElementById('forgotEmail').value = '';
    document.getElementById('otpInput').value = '';
    document.getElementById('newPasswordInput').value = '';
};

window.sendOTP = async () => {
    const email = document.getElementById('forgotEmail').value.trim();
    if(!email) return alert("Enter your email");
    try {
        const res = await fetch("https://mini-drive-backend-ba55.onrender.com/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        if (!res.ok) throw new Error("Could not send OTP. Check email.");
        document.getElementById('forgotStep1').classList.add('hidden');
        document.getElementById('forgotStep2').classList.remove('hidden');
        alert("Verification code sent to your email!");
    } catch (err) { alert(err.message); }
};

window.resetPassword = async () => {
    const email = document.getElementById('forgotEmail').value.trim();
    const otp = document.getElementById('otpInput').value.trim();
    const newPassword = document.getElementById('newPasswordInput').value;
    if(!otp || !newPassword) return alert("Fill in all fields");

    try {
        const res = await fetch("https://mini-drive-backend-ba55.onrender.com/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, otp, newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Invalid OTP");
        alert("Password reset successfully! You can now log in.");
        closeForgotModal();
    } catch (err) { alert(err.message); }
};

// --- MENU TOGGLES ---
window.toggleNewMenu = function(e) {
    e.stopPropagation(); 
    const menu = document.getElementById('newMenu');
    menu.classList.toggle('hidden');
    document.querySelectorAll('.action-dropdown').forEach(m => m.classList.add('hidden'));
};

window.toggleDropdown = function(id) {
    document.querySelectorAll('.action-dropdown').forEach(m => {
        if(m.id !== id) m.classList.add('hidden');
    });
    const menu = document.getElementById(id);
    if(menu) menu.classList.toggle('hidden');
    const newMenu = document.getElementById('newMenu');
    if(newMenu) newMenu.classList.add('hidden');
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('#addBtn') && !e.target.closest('#newMenu')) {
        const newMenu = document.getElementById('newMenu');
        if (newMenu) newMenu.classList.add('hidden');
    }
    if (!e.target.closest('.icon-btn') && !e.target.closest('.action-dropdown')) {
        document.querySelectorAll('.action-dropdown').forEach(m => m.classList.add('hidden'));
    }
});

// --- FOLDER NAVIGATION ---
window.renderBreadcrumbs = function() {
    const nav = document.getElementById("breadcrumbNav");
    if(!nav) return;
    nav.innerHTML = '';
    
    breadcrumbPath.forEach((step, index) => {
        const isLast = index === breadcrumbPath.length - 1;
        const span = document.createElement('span');
        span.style.cursor = isLast ? 'default' : 'pointer';
        span.style.color = isLast ? 'white' : 'var(--accent-color)';
        span.innerHTML = index === 0 ? `<i class="fa-solid fa-hard-drive"></i> ${step.name}` : step.name;
        
        if(!isLast) {
            span.onclick = () => goToFolder(index);
            span.onmouseover = () => span.style.textDecoration = "underline";
            span.onmouseout = () => span.style.textDecoration = "none";
        }
        nav.appendChild(span);
        
        if(!isLast) {
            const separator = document.createElement('span');
            separator.style.margin = '0 8px';
            separator.style.color = 'var(--text-secondary)';
            separator.innerText = '>';
            nav.appendChild(separator);
        }
    });
};

window.openFolder = function(folderId, folderName) {
    currentFolderId = folderId;
    breadcrumbPath.push({ id: folderId, name: folderName });
    renderBreadcrumbs();
    loadFiles(); 
};

window.goToFolder = function(index) {
    breadcrumbPath = breadcrumbPath.slice(0, index + 1);
    currentFolderId = breadcrumbPath[index].id;
    renderBreadcrumbs();
    loadFiles();
};

window.openCreateFolderModal = function() {
    document.getElementById('createFolderModal').classList.add('active');
    document.getElementById('newFolderName').focus();
};

window.closeCreateFolderModal = function() {
    document.getElementById('createFolderModal').classList.remove('active');
    document.getElementById('newFolderName').value = '';
};

window.createNewFolder = async function() {
    const folderName = document.getElementById('newFolderName').value.trim();
    if (!folderName) return alert("Folder name cannot be empty");
    try {
        const token = localStorage.getItem("token");
        const res = await fetch("https://mini-drive-backend-ba55.onrender.com/create-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: folderName, parentId: currentFolderId })
        });
        if (!res.ok) throw new Error("Failed to create folder");
        closeCreateFolderModal();
        loadFiles(); 
    } catch (err) { alert(err.message); }
};

// --- FILE UPLOAD ---
window.handleUpload = async (e) => {
    const filesToUpload = e.target.files;
    if (!filesToUpload || filesToUpload.length === 0) return;

    const progressBox = document.getElementById('globalUploadProgress');
    const statusText = document.getElementById('globalUploadStatus');
    progressBox.classList.remove('hidden');

    try {
        const token = localStorage.getItem("token");
        const totalFiles = filesToUpload.length;

        for (let i = 0; i < totalFiles; i++) {
            const file = filesToUpload[i];
            statusText.textContent = `Uploading ${i + 1} of ${totalFiles}: ${file.name}...`;

            const formData = new FormData();
            formData.append("file", file);
            if (currentFolderId) formData.append("folderId", currentFolderId);
            if (file.webkitRelativePath) formData.append("relativePath", file.webkitRelativePath);

            const response = await fetch("https://mini-drive-backend-ba55.onrender.com/upload", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });
            if (!response.ok) {
                const data = await response.json();
                console.error("Failed to upload:", file.name, data.error);
            }
        }

        e.target.value = ''; // Reset input
        await loadFiles();
    } catch (error) {
        alert("Upload failed: " + error.message);
    } finally {
        progressBox.classList.add('hidden');
    }
};

// --- DATA FETCHING ---
async function loadFiles() {
    const token = localStorage.getItem("token");
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const myDriveGrid = document.getElementById("myDriveGrid");
    const sharedFilesGrid = document.getElementById("sharedFilesGrid");
    const sharedDriveSection = document.getElementById("sharedDriveSection");
    const adminSection = document.getElementById("adminSection");

    if (myDriveGrid) myDriveGrid.innerHTML = '<div class="spinner" style="margin: 20px;"></div>';

    // 1. BULLETPROOF RESET: Always hide Admin Section by default for every user
    if (adminSection) adminSection.classList.add('hidden');

    // Pending Requests Fetch
    const accessReqSection = document.getElementById("accessRequestsSection");
    const accessReqGrid = document.getElementById("accessRequestsGrid");
    try {
        const reqRes = await fetch("https://mini-drive-backend-ba55.onrender.com/pending-requests", { headers });
        if (reqRes.ok) {
            const pendingFiles = await reqRes.json();
            if (pendingFiles.length > 0 && accessReqSection) {
                accessReqSection.classList.remove('hidden');
                accessReqGrid.innerHTML = '';
                pendingFiles.forEach(file => {
                    file.accessRequests.forEach(req => {
                        const div = document.createElement('div');
                        div.className = 'file-card';
                        div.innerHTML = `
                            <div style="padding: 10px;">
                                <h4 style="margin-bottom: 5px; font-size: 1rem;">${file.fileName}</h4>
                                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px;"><b>${req.email}</b> requesting access.</p>
                                <select id="perm-${file._id}-${req.email}" style="width:100%; margin-bottom: 10px; padding: 8px; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--panel-border); border-radius: 6px;">
                                    <option value="view">Can View</option>
                                    <option value="edit">Can Edit</option>
                                </select>
                                <div style="display: flex; gap: 10px;">
                                    <button class="primary-btn" style="padding: 8px; flex: 1;" onclick="approveAccess('${file._id}', '${req.email}')">Approve</button>
                                    <button class="secondary-btn" style="padding: 8px; flex: 1; color: #ef4444; border-color: #ef4444;" onclick="rejectAccess('${file._id}', '${req.email}')">Reject</button>
                                </div>
                            </div>
                        `;
                        accessReqGrid.appendChild(div);
                    });
                });
            } else if (accessReqSection) {
                accessReqSection.classList.add('hidden');
            }
        }
    } catch (e) { console.error("Could not load requests", e); }
    
    try {
        const urlParams = currentFolderId ? `?folderId=${currentFolderId}` : '';
        const [myRes, sharedRes] = await Promise.all([
            fetch(`https://mini-drive-backend-ba55.onrender.com/my-drive${urlParams}`, { headers }),
            // 🔥 CHANGED: Now hitting /shared-data instead of /shared-files
            fetch("https://mini-drive-backend-ba55.onrender.com/shared-data", { headers })
        ]);
        
        const myDriveData = await myRes.json();
        const sharedData = await sharedRes.json(); // 🔥 CHANGED: Now contains .files and .folders
        
        if (!myRes.ok) throw new Error(myDriveData.error || "Failed to fetch drive data");

        if (myDriveGrid) {
            myDriveGrid.innerHTML = '';
            if (myDriveData.folders) {
                myDriveData.folders.forEach(folder => {
                    myDriveGrid.appendChild(buildFolderCard(folder, 'view'));
                });
            }
            if (myDriveData.files) {
                myDriveData.files.forEach(file => {
                    // 🔥 THE FIX: Dynamically check if you actually own the file!
                    const isOwner = currentUser && file.owner === currentUser.email;
                    const isAdmin = currentUser && currentUser.role === 'admin';
                    
                    myDriveGrid.appendChild(buildFileCard(file._id, file, isOwner, isAdmin, 'view'));
                });
            }
            if (myDriveGrid.children.length === 0) {
                myDriveGrid.innerHTML = '<p class="text-secondary" style="padding: 15px;">No files or folders here.</p>';
            }
        }
        
        // 2. BULLETPROOF SHARED LOGIC: ONLY show if root folder AND user is NOT an admin
        if (currentFolderId === null && currentUser && currentUser.role !== 'admin') {
            if(sharedDriveSection) sharedDriveSection.classList.remove('hidden');
            if(sharedFilesGrid) {
                sharedFilesGrid.innerHTML = '';
                
                // 🔥 NEW: Check for both folders AND files
                const hasSharedFiles = sharedData.files && sharedData.files.length > 0;
                const hasSharedFolders = sharedData.folders && sharedData.folders.length > 0;

                if(hasSharedFiles || hasSharedFolders) {
                    // Render Shared Folders First
                    if (hasSharedFolders) {
                        sharedData.folders.forEach(folder => {
                            const sData = currentUser ? folder.sharedWith.find(u => u.email === currentUser.email) : null;
                            const perm = sData ? sData.permission : 'view';
                            sharedFilesGrid.appendChild(buildFolderCard(folder, perm));
                        });
                    }
                    // Render Shared Files Second
                    if (hasSharedFiles) {
                        sharedData.files.forEach(file => {
                            const sData = currentUser ? file.sharedWith.find(u => u.email === currentUser.email) : null;
                            const perm = sData ? sData.permission : 'view';
                            sharedFilesGrid.appendChild(buildFileCard(file._id, file, false, false, perm));
                        });
                    }
                } else {
                    sharedFilesGrid.innerHTML = '<p class="text-secondary" style="padding: 15px;">No files or folders shared with you yet.</p>';
                }
            }
        } else {
            // Hide shared section for Admins OR if we are inside a folder
            if(sharedDriveSection) sharedDriveSection.classList.add('hidden');
        }
        
    } catch (error) {
        if(myDriveGrid) myDriveGrid.innerHTML = `<p class="text-danger" style="padding: 15px;">Error: ${error.message}</p>`;
    }

    // 3. BULLETPROOF ADMIN LOGIC: Unhide the panel ONLY if they pass the check
    if (currentUser && currentUser.role === 'admin') {
        if (adminSection) {
            adminSection.classList.remove('hidden');
            fetchAdminData(); 
        }
    }
}

// 🔥 NEW FUNCTION: Place this right below loadFiles()
async function fetchAdminData() {
    const token = localStorage.getItem("token");
    try {
        const res = await fetch("https://mini-drive-backend-ba55.onrender.com/admin/all-data", {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (res.ok) {
            const grid = document.getElementById('adminFilesGrid');
            if(grid) {
                grid.innerHTML = '';
                if(data.files.length === 0) {
                     grid.innerHTML = '<p class="text-secondary" style="padding: 15px;">No files in the database.</p>';
                } else {
                     data.files.forEach(file => {
                         // isOwner = false, isAdmin = true
                         grid.appendChild(buildFileCard(file._id, file, false, true)); 
                     });
                }
            }
        }
    } catch (e) {
        console.error("Admin fetch error:", e);
    }
}

// --- FILE CARDS & PREVIEW ---
function buildFolderCard(folder, userPermission = 'view') {
    const card = document.createElement('div');
    card.className = 'list-row';
    card.style.cursor = 'pointer';
    card.onclick = (e) => {
        if(!e.target.closest('.icon-btn') && !e.target.closest('.action-dropdown')) {
            openFolder(folder._id, folder.name);
        }
    };
    
    const dateStr = new Date(folder.createdAt).toLocaleDateString();
    const isOwner = currentUser && folder.owner === currentUser.email;
    const isAdmin = currentUser && currentUser.role === 'admin';
    const canEdit = isOwner || isAdmin || userPermission === 'edit';
    
    // 🔥 THE FIX: If they aren't the owner and can't edit, don't show the menu!
    const showMenu = canEdit || isOwner;

    card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
            <i class="fa-solid fa-folder" style="color: #8ab4f8; font-size: 1.2rem;"></i>
            <span>${folder.name}</span>
        </div>
        <div>${isOwner ? 'me' : folder.owner}</div>
        <div>${dateStr}</div>
        <div>--</div>
        
        ${showMenu ? `
        <div style="position: relative; text-align: right;">
            <button class="icon-btn" onclick="toggleDropdown('menu-${folder._id}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            <div id="menu-${folder._id}" class="action-dropdown hidden">
                ${canEdit ? `<button onclick="renameFolder('${folder._id}', '${folder.name}')"><i class="fa-solid fa-pen"></i> Rename</button>` : ""}
                ${isOwner ? `<button onclick="openShareModal('${folder._id}', 'folder')"><i class="fa-solid fa-user-plus"></i> Share</button>` : ""}
                ${canEdit ? `<button onclick="deleteFolder('${folder._id}')" style="color: #fca5a5;"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
            </div>
        </div>
        ` : `<div style="text-align: right; padding-right: 15px;"><i class="fa-solid fa-lock" style="color: var(--text-secondary); opacity: 0.5;" title="View Only"></i></div>`}
    `;
    return card;
}

function buildFileCard(id, data, isOwner, isAdmin, userPermission = 'view') {
    const card = document.createElement('div');
    card.className = 'list-row';
    
    const fileName = data.fileName || data.name || 'Untitled File';
    const type = getFileType(fileName);
    const icon = getFileIcon(type);
    const dateStr = data.createdAt ? new Date(data.createdAt).toLocaleDateString() : 'Unknown date';
    const fileId = data._id; 
    const canEdit = isOwner || isAdmin || userPermission === 'edit';
    
    // Dynamic size parsing!
    const sizeStr = data.size ? (data.size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown';

    card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; cursor: pointer;" onclick="viewFile('${data.url}', '${fileName}')">
            <span style="font-size: 1.2rem;">${icon}</span>
            <span style="word-break: break-all;">${fileName}</span>
        </div>
        <div>${isOwner ? 'me' : data.owner}</div>
        <div>${dateStr}</div>
        <div>${sizeStr}</div>
        <div style="position: relative; text-align: right;">
            <button class="icon-btn" onclick="toggleDropdown('menu-${fileId}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            <div id="menu-${fileId}" class="action-dropdown hidden">
                <button onclick="viewFile('${data.url}', '${fileName}')"><i class="fa-solid fa-eye"></i> View</button>
                <button onclick="downloadFile('${data.url}', '${fileName}')"><i class="fa-solid fa-download"></i> Download</button>
                ${isOwner ? `<button onclick="openShareModal('${fileId}')"><i class="fa-solid fa-user-plus"></i> Share</button>` : ""}
                
                ${canEdit ? `<button onclick="deleteFile('${fileId}')" style="color: #fca5a5;"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
            </div>
        </div>
    `;
    return card;
}

window.viewFile = function(url, fileName) {
    showView("fileViewContainer");
    const content = document.getElementById("fileViewContent");
    const type = getFileType(fileName);
    let viewerHTML = '';

    if (type === "pdf") {
        viewerHTML = `<embed src="${url}" type="application/pdf" style="width:100%; height:600px; border:none; border-radius: 12px; background: white;"></embed>`;
    } else if (["ppt", "doc"].includes(type)) {
        const previewUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
        viewerHTML = `<iframe src="${previewUrl}" style="width:100%; height:600px; border:none; background: white; border-radius: 12px;"></iframe>`;
    } else if (type === "image") {
        viewerHTML = `<img src="${url}" style="max-width:100%; border-radius:12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">`;
    } else if (type === "video") {
        viewerHTML = `<video src="${url}" controls style="width:100%; max-height: 600px; border-radius:12px; background: black;"></video>`;
    } else if (type === "audio") {
        viewerHTML = `
            <div style="padding: 50px 20px; text-align: center; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid var(--panel-border);">
                <i class="fa-solid fa-music" style="font-size: 4rem; color: var(--accent-color); margin-bottom: 20px;"></i>
                <h3 style="margin-bottom: 20px; word-break: break-all;">${fileName}</h3>
                <audio src="${url}" controls style="width: 80%; max-width: 400px;"></audio>
            </div>
        `;
    } else {
        viewerHTML = `
            <div style="padding: 40px; text-align: center; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid var(--panel-border);">
                <i class="fa-solid fa-file-circle-exclamation" style="font-size: 4rem; color: var(--text-secondary); margin-bottom: 20px;"></i>
                <h3 style="margin-bottom: 10px;">No Preview Available</h3>
                <p style="color: var(--text-secondary);">This file type cannot be previewed in the browser.</p>
            </div>
        `;
    }

    content.innerHTML = viewerHTML + `
        <div style="margin-top: 20px; text-align: center;">
            <button class="primary-btn" id="downloadBtn" onclick="downloadFile('${url}', '${fileName}')" style="width: auto; padding: 10px 25px;">
                <i class="fa-solid fa-download"></i> Download Original
            </button>
        </div>`;
};

window.downloadFile = async function(fileUrl, fileName) {
    const btn = document.getElementById('downloadBtn');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Downloading...';
    try {
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName || "downloaded_file";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        window.open(fileUrl, "_blank");
    } finally {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-download"></i> Download Original';
    }
};

window.deleteFile = async function(fileId) {
    if (!confirm("Are you sure you want to delete this file?")) return;

    console.log("SENDING TO BACKEND, FILE ID:", fileId);

    const token = localStorage.getItem("token");
    try {
        const res = await fetch("https://mini-drive-backend-ba55.onrender.com/delete-file", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            // 🔥 THE FIX: Explicitly name the variable fileId so the backend recognizes it
            body: JSON.stringify({ fileId: fileId }) 
        });

        if (res.ok) {
            // 🔥 THE FIX: Automatically refresh the files on the screen so the ghost disappears!
            loadFiles(); 
        } else {
            const data = await res.json();
            console.error("Backend refused:", data);
            alert(data.error || "Failed to delete file");
        }
    } catch (err) {
        console.error("Network error:", err);
    }
}

window.renameFolder = async function(e, folderId, oldName) {
    e.stopPropagation();
    const newName = prompt("Enter new folder name:", oldName);
    if (!newName || newName.trim() === oldName) return;
    try {
        const token = localStorage.getItem("token");
        const res = await fetch("https://mini-drive-backend-ba55.onrender.com/rename-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ folderId, newName: newName.trim() })
        });
        if (res.ok) loadFiles();
    } catch (err) { alert("Rename failed: " + err.message); }
};

window.deleteFolder = async function(folderId) {
    if (!confirm("Are you sure you want to delete this folder and EVERYTHING inside it?")) return;

    console.log("SENDING TO BACKEND, FOLDER ID:", folderId);

    const token = localStorage.getItem("token");
    try {
        const res = await fetch("https://mini-drive-backend-ba55.onrender.com/delete-folder", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            // 🔥 THE FIX: Explicitly name the variable folderId so the backend recognizes it
            body: JSON.stringify({ folderId: folderId }) 
        });

        if (res.ok) {
            // 🔥 THE FIX: Automatically refresh the files on the screen
            loadFiles(); 
        } else {
            const data = await res.json();
            console.error("Backend refused:", data);
            alert(data.error || "Failed to delete folder");
        }
    } catch (err) {
        console.error("Network error:", err);
    }
}

// --- SHARE MODAL & LOGIC ---
// --- SHARE MODAL & LOGIC ---
let currentShareId = null;
let currentShareType = null; // Will be 'file' or 'folder'

window.openShareModal = function(id, type = 'file') {
    currentShareId = id;
    currentShareType = type;
    document.getElementById('shareModal').classList.add('active');
};

window.closeShareModal = function() {
    document.getElementById('shareModal').classList.remove('active');
    currentShareId = null;
    currentShareType = null;
    if (document.getElementById('shareEmail')) document.getElementById('shareEmail').value = ''; 
};

window.sendShareEmail = async function() {
    const email = document.getElementById('shareEmail').value.trim();
    const permission = document.getElementById('sharePermission').value;
    if (!email) return alert("Please enter an email");
    
    // 🔥 THE UPGRADE: Dynamically hit the right backend route based on what we are sharing!
    const endpoint = currentShareType === 'folder' ? "/share-folder" : "/share-file";
    const payload = currentShareType === 'folder' ? { folderId: currentShareId, email, permission } : { fileId: currentShareId, email, permission };

    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`https://mini-drive-backend-ba55.onrender.com${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to share ${currentShareType}`);
        
        alert(`${currentShareType.charAt(0).toUpperCase() + currentShareType.slice(1)} shared with ${email}!`);
        closeShareModal();
        loadFiles();
    } catch (error) { alert("Error sharing: " + error.message); }
};

window.copyModalShareLink = function() {
    if(!currentShareId) return;
    const param = currentShareType === 'folder' ? 'folderId' : 'fileId';
    const url = `${window.location.origin}${window.location.pathname}?${param}=${currentShareId}`;
    navigator.clipboard.writeText(url).then(() => {
        alert("Share link copied to clipboard!");
        closeShareModal();
    });
};

window.handleSharedLink = async function(fileId) {
    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`https://mini-drive-backend-ba55.onrender.com/file/${fileId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (data.access) {
            // If they have access, open the file normally
            viewFile(data.file.url, data.file.fileName);
        } else if (data.hasRequested) {
            // 🔥 THE FIX: No big blocking box. Just a clean alert and back to dashboard!
            alert(`You have already requested access to ${data.fileName}. Waiting for owner approval.`);
            goBackToDashboard();
        } else {
            // 🔥 THE FIX: Use a clean native popup to ask if they want access
            const wantAccess = confirm(`You need access to view "${data.fileName}". Would you like to request access from the owner?`);
            if (wantAccess) {
                requestAccess(data.fileId);
            } else {
                goBackToDashboard();
            }
        }
    } catch (err) {
        alert(`Error: ${err.message}`);
        goBackToDashboard();
    }
};

window.requestAccess = async function(fileId) {
    try {
        const token = localStorage.getItem("token");
        const res = await fetch("https://mini-drive-backend-ba55.onrender.com/request-access", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ fileId })
        });
        if (res.ok) {
            // 🔥 THE FIX: Alert success, then instantly load their dashboard
            alert("Access requested successfully! The owner has been notified.");
            goBackToDashboard();
        }
    } catch (err) { 
        alert("Error requesting access"); 
        goBackToDashboard();
    }
};

window.approveAccess = async function(fileId, userEmail) {
    const perm = document.getElementById(`perm-${fileId}-${userEmail}`).value;
    try {
        const res = await fetch("https://mini-drive-backend-ba55.onrender.com/share-file", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") },
            body: JSON.stringify({ fileId: fileId, email: userEmail, permission: perm })
        });
        if (res.ok) {
            alert("Access granted!");
            loadFiles();
        }
    } catch (err) { alert("Error: " + err.message); }
};

window.rejectAccess = async function(fileId, userEmail) {
    if(!confirm(`Reject access for ${userEmail}?`)) return;
    try {
        const res = await fetch("https://mini-drive-backend-ba55.onrender.com/reject-request", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") },
            body: JSON.stringify({ fileId: fileId, email: userEmail })
        });
        if (res.ok) loadFiles();
    } catch (err) { alert("Error: " + err.message); }
};