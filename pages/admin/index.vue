<template>
  <!-- Auth loading -->
  <div v-if="authLoading" class="flex-1 flex items-center justify-center">
    <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-400 dark:text-blue-500 animate-spin" />
  </div>

  <!-- Login form when not authenticated -->
  <div v-else-if="!auth.isAuthenticated.value" class="flex-1 flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <div class="flex items-center justify-center gap-2.5 mb-3">
          <UIcon name="i-lucide-scale" class="w-6 h-6 text-blue-500 dark:text-blue-400" />
           <span class="text-3xl font-semibold text-gray-900 dark:text-white">全时在线的争议解决专家</span>
        <p class="text-sm text-gray-500 dark:text-gray-400 font-mono mt-1">Always Online Dispute Resolution Expert</p>
        <p class="text-sm text-gray-400 dark:text-gray-500 font-mono mt-2">调解员工作台 · Mediator Workstation</p>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">mediator sign in</p>
      </div>
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 shadow-sm dark:shadow-none">
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">用户名</label>
            <UInput v-model="loginUsername" placeholder="请输入拼音用户名" icon="i-lucide-user" size="lg" :disabled="loginLoading" autocomplete="username" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">密码</label>
            <UInput v-model="loginPassword" type="password" placeholder="请输入密码" icon="i-lucide-lock" size="lg" :disabled="loginLoading" autocomplete="current-password" />
          </div>
          <UAlert v-if="loginError" color="error" variant="soft" :title="loginError" />
          <UButton type="submit" block size="xl" :loading="loginLoading" :disabled="!loginUsername.trim() || !loginPassword.trim()" class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100">
            登录
          </UButton>
        </form>
      </div>
    </div>
  </div>

  <!-- Main content when authenticated -->
  <div v-else class="flex-1 flex min-h-0">
    <!-- Left: Collapsible Sidebar -->
    <div class="w-72 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-950">
      <!-- Section 1: 案件列表 -->
      <div class="border-b border-gray-200 dark:border-gray-800">
        <button class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800" @click="sidebarOpen.cases = !sidebarOpen.cases; if(sidebarOpen.cases) rightMode = 'cases-list'">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">📋 案件列表</span>
          <UIcon :name="sidebarOpen.cases ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
        </button>
        <div v-if="sidebarOpen.cases" class="px-2 pb-2 space-y-1">
          <UInput v-model="searchQuery" placeholder="搜索案件编号..." icon="i-lucide-search" size="sm" class="mb-2" />
          <div v-if="casesLoading" class="flex items-center justify-center py-8">
            <UIcon name="i-lucide-loader-2" class="w-5 h-5 text-blue-400 animate-spin" />
          </div>
          <template v-else>
            <button v-for="c in filteredCases" :key="c.id"
              class="w-full text-left px-3 py-2 rounded-md transition-colors border text-sm"
              :class="selectedCaseId === c.id ? 'bg-blue-50 dark:bg-blue-950 border-blue-200' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50'"
              @click="selectCase(c.id)">
              <div class="font-mono text-xs text-gray-400 mb-0.5">{{ c.id }}</div>
              <div class="font-medium text-gray-900 dark:text-white truncate">{{ c.title }}</div>
              <div class="text-xs text-gray-500 mt-0.5">{{ c.partyAName }} vs {{ c.partyBName }}</div>
            </button>
            <div v-if="!casesLoading && filteredCases.length === 0" class="py-8 text-center">
              <p class="text-xs text-gray-400">暂无案件</p>
            </div>
          </template>
        </div>
      </div>

      <!-- Section 2: 知识库 -->
      <div class="border-b border-gray-200 dark:border-gray-800">
        <button class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800" @click="sidebarOpen.kb = !sidebarOpen.kb">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">📚 知识库</span>
          <UIcon :name="sidebarOpen.kb ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
        </button>
        <div v-if="sidebarOpen.kb" class="px-2 pb-2 grid grid-cols-3 gap-1">
          <button class="px-2 py-1.5 text-xs rounded border transition-colors"
            :class="rightMode === 'kb-upload' ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 text-blue-700' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 hover:bg-gray-50'"
            @click="rightMode = 'kb-upload'">
            📤 上传
          </button>
          <button class="px-2 py-1.5 text-xs rounded border transition-colors"
            :class="rightMode === 'kb-view' ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 text-blue-700' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 hover:bg-gray-50'"
            @click="rightMode = 'kb-view'; loadKbList()">
            👁️ 查看
          </button>
          <button class="px-2 py-1.5 text-xs rounded border transition-colors"
            :class="rightMode === 'kb-search' ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 text-blue-700' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 hover:bg-gray-50'"
            @click="rightMode = 'kb-search'">
            🔍 搜索
          </button>
        </div>
      </div>

      <!-- Section 3: 近期对话 -->
      <div class="border-b border-gray-200 dark:border-gray-800">
        <button class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800" @click="sidebarOpen.history = !sidebarOpen.history; if(sidebarOpen.history) rightMode = 'history'">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">💬 近期对话</span>
          <UIcon :name="sidebarOpen.history ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
        </button>
        <div v-if="sidebarOpen.history" class="px-2 pb-2 space-y-1">
          <div v-if="savedConversations.length === 0" class="text-xs text-gray-400 py-3 text-center">暂无保存的对话</div>
          <button v-for="c in savedConversations" :key="c.id"
            class="w-full text-left px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            @click="openSavedConversation(c.id)">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ c.title }}</div>
            <div class="text-xs text-gray-500 mt-0.5">{{ c.caseId }} · {{ c.caseTitle }}</div>
            <div class="text-xs text-gray-400 mt-0.5">{{ c.messageCount }} 条消息 · {{ formatDateTime(c.createdAt) }}</div>
          </button>
        </div>
      </div>

      <!-- Section 3: 设置 -->
      <div class="border-b border-gray-200 dark:border-gray-800">
        <button class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800" @click="sidebarOpen.settings = !sidebarOpen.settings">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">⚙️ 设置</span>
          <UIcon :name="sidebarOpen.settings ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
        </button>
        <div v-if="sidebarOpen.settings" class="px-4 py-3 text-xs text-gray-500 space-y-2">
          <div>当前用户：{{ auth.user.value?.name }}</div>
          <div>角色：{{ auth.user.value?.role === 'admin' ? '管理员' : '调解员' }}</div>
          <UButton icon="i-lucide-plus" size="sm" block variant="soft" @click="showCreateDialog = true">新建案件</UButton>
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-auto p-3 border-t border-gray-200 dark:border-gray-800">
        <UButton icon="i-lucide-log-out" size="sm" block variant="ghost" @click="auth.logout()">登出</UButton>
      </div>
    </div>

    <!-- Right: KB Upload -->
    <div v-if="rightMode === 'kb-upload' && !selectedCaseId" class="flex-1 flex flex-col bg-white dark:bg-gray-900">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-upload" class="w-5 h-5 text-blue-600" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">上传文档</span>
        <span class="text-xs text-gray-400 ml-auto">仅支持 .md 格式</span>
      </div>
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <div class="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center bg-gray-50 dark:bg-gray-950">
          <UIcon name="i-lucide-file-up" class="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">点击下方按钮选择 .md 文档</p>
          <input ref="kbFileInput" type="file" accept=".md,text/markdown" class="hidden" @change="onKbFileSelected" />
          <UButton icon="i-lucide-folder-open" color="primary" @click="kbFileInput?.click()">选择 .md 文件</UButton>
        </div>
        <div v-if="kbUploadFile" class="bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
          <UIcon name="i-lucide-file-text" class="w-5 h-5 text-blue-500" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ kbUploadFile.name }}</div>
            <div class="text-xs text-gray-500">{{ (kbUploadFile.size / 1024).toFixed(1) }} KB</div>
          </div>
          <UButton size="sm" :loading="kbUploading" @click="uploadKbFile">上传</UButton>
        </div>
        <UAlert v-if="kbUploadMsg" :color="kbUploadOk ? 'success' : 'error'" variant="soft" :title="kbUploadMsg" />
      </div>
    </div>

    <!-- Right: KB View -->
    <div v-if="rightMode === 'kb-view' && !selectedCaseId" class="flex-1 flex flex-col bg-white dark:bg-gray-900">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-library" class="w-5 h-5 text-blue-600" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">知识库列表</span>
        <span class="text-xs text-gray-400 ml-auto">{{ kbList.length }} 个文档 · {{ kbStats }}</span>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <div v-if="kbListLoading" class="flex items-center justify-center py-12 gap-2 text-sm text-blue-500">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 加载中...
        </div>
        <div v-else-if="kbList.length">
          <div v-for="doc in kbList" :key="doc.path" class="bg-gray-50 dark:bg-gray-950 rounded-lg p-3 border border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <UIcon name="i-lucide-file-text" class="w-5 h-5 text-blue-500 shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ doc.path.split('/').pop() }}</div>
              <div class="text-xs text-gray-400 font-mono truncate">{{ doc.path }}</div>
            </div>
            <div class="text-xs text-gray-500 shrink-0">{{ doc.chunks }} 块</div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-full">
          <p class="text-sm text-gray-400">知识库为空</p>
        </div>
      </div>
    </div>

    <!-- Right: KB Search -->
    <div v-if="rightMode === 'kb-search' && !selectedCaseId" class="flex-1 flex flex-col bg-white dark:bg-gray-900">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-search" class="w-5 h-5 text-blue-600" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">知识库检索</span>
        <span class="text-xs text-gray-400 ml-auto">{{ kbResults.length }} 条结果</span>
      </div>
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <form @submit.prevent="searchKB" class="flex gap-2">
          <UInput v-model="kbQuery" placeholder="输入关键词搜索法律知识..." icon="i-lucide-search" size="md" class="flex-1" />
          <UButton type="submit" :loading="kbSearching" :disabled="!kbQuery.trim()" icon="i-lucide-search">搜索</UButton>
        </form>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <div v-if="kbSearching" class="flex items-center justify-center py-12 gap-2 text-sm text-blue-500">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 搜索中...
        </div>
        <div v-else-if="kbResults.length">
          <div v-for="(r, i) in kbResults" :key="i" class="bg-gray-50 dark:bg-gray-950 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-mono text-blue-600 dark:text-blue-400">{{ r.path.split('/').pop()?.replace('.md','') }}</span>
              <span class="text-xs text-gray-400">相关度: {{ (r.score * 100).toFixed(0) }}%</span>
            </div>
            <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{{ r.content }}</div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-full">
          <p class="text-sm text-gray-400">输入关键词搜索法律知识库（{{ kbStats }}）</p>
        </div>
      </div>
    </div>

    <!-- Right: History List -->
    <div v-if="rightMode === 'history' && !selectedCaseId" class="flex-1 flex flex-col bg-white dark:bg-gray-900">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-message-square" class="w-5 h-5 text-blue-600" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">近期对话</span>
      </div>
      <div class="flex-1 flex items-center justify-center">
        <p class="text-sm text-gray-400">绑定案件后将在此显示对话记录</p>
      </div>
    </div>

    <!-- Right: Cases List (when no case selected) -->
    <div v-if="rightMode === 'cases-list' && !selectedCaseId" class="flex-1 flex flex-col bg-white dark:bg-gray-900">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-folder" class="w-5 h-5 text-blue-600" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">我的案件</span>
        <span class="text-xs text-gray-400 ml-auto">{{ filteredCases.length }} 个案件</span>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <div v-if="casesLoading" class="flex items-center justify-center py-12 gap-2 text-sm text-blue-500">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 加载中...
        </div>
        <div v-else-if="filteredCases.length">
          <div v-for="c in filteredCases" :key="c.id"
            class="bg-gray-50 dark:bg-gray-950 rounded-lg p-4 border border-gray-200 dark:border-gray-800 cursor-pointer hover:border-blue-300 transition-colors"
            @click="selectCase(c.id)">
            <div class="flex items-center justify-between mb-1.5">
              <span class="font-mono text-xs text-blue-600">{{ c.id }}</span>
              <span class="text-xs text-gray-400">{{ c.phase }}</span>
            </div>
            <div class="text-sm font-medium text-gray-900 dark:text-white mb-1">{{ c.title }}</div>
            <div class="text-xs text-gray-500">{{ c.partyAName }} vs {{ c.partyBName }}</div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-full">
          <p class="text-sm text-gray-400">暂无案件</p>
        </div>
      </div>
    </div>

    <!-- Right: Empty State -->
    <div v-if="!selectedCaseId && rightMode === ''" class="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
      <div class="text-center">
        <UIcon name="i-lucide-scale" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">调解员工作台</h2>
        <p class="text-sm text-gray-400 dark:text-gray-500">选择左侧案件开始工作</p>
      </div>
    </div>

    <!-- Right: Case Detail when selected -->
    <div v-else-if="selectedCaseId" class="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-900">
      <!-- Case Info Bar -->
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 text-sm">
            <span class="font-mono text-blue-600 dark:text-blue-400">{{ selectedCaseId }}</span>
            <span class="text-gray-900 dark:text-white font-medium">{{ selectedCaseTitle }}</span>
            <UBadge :color="getStatusColor(selectedCaseStatus)" variant="soft" size="xs">{{ getStatusLabel(selectedCaseStatus) }}</UBadge>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-400">{{ selectedCaseParties }}</span>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors disabled:opacity-50"
              :disabled="savingConversation || !selectedMessages.length"
              @click="saveCurrentConversation">
              <UIcon :name="savingConversation ? 'i-lucide-loader-2' : 'i-lucide-save'" :class="savingConversation ? 'animate-spin' : ''" class="w-3.5 h-3.5" />
              {{ savingConversation ? '保存中…' : '保存对话' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Case Materials (collapsible) -->
      <div class="shrink-0 border-b border-gray-200 dark:border-gray-800">
        <button class="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm" @click="materialsOpen = !materialsOpen">
          <UIcon :name="materialsOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
          <UIcon name="i-lucide-folder-open" class="w-4 h-4 text-blue-500" />
          <span class="font-medium text-gray-700 dark:text-gray-300">案件资料</span>
          <span class="text-xs text-gray-400">{{ materialCount }} 项</span>
        </button>
        <div v-if="materialsOpen" class="px-4 pb-3 flex gap-2 flex-wrap">
          <button v-if="caseDetail?.description"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
            @click="viewingMaterial = 'description'">
            <UIcon name="i-lucide-file-text" class="w-3.5 h-3.5" />
            案件描述
          </button>
          <button v-if="caseDetail?.claimsSummary"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
            @click="viewingMaterial = 'claims'">
            <UIcon name="i-lucide-scale" class="w-3.5 h-3.5" />
            请求和答辩
          </button>
          <button v-if="caseDetail?.evidenceSummary"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
            @click="viewingMaterial = 'evidence'">
            <UIcon name="i-lucide-search" class="w-3.5 h-3.5" />
            证据和质证
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900 transition-colors"
            @click="openFileList">
            <UIcon name="i-lucide-paperclip" class="w-3.5 h-3.5" />
            原始文件
            <span v-if="caseFiles.length" class="text-[10px] opacity-70">({{ caseFiles.length }})</span>
          </button>
          <div v-if="materialCount === 0 && caseFiles.length === 0" class="text-xs text-gray-400 py-1">暂无案件资料</div>
        </div>
      </div>

      <!-- AI Mediation Skills (under materials) -->
      <div class="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30">
        <div class="flex items-center gap-2 mb-1.5">
          <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-violet-600" />
          <span class="text-xs font-semibold text-violet-700 dark:text-violet-300">AI 调解技能</span>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-400 transition-colors disabled:opacity-50"
            :disabled="scriptLoading"
            @click="generateScript">
            <UIcon :name="scriptLoading ? 'i-lucide-loader-2' : 'i-lucide-message-circle'" :class="scriptLoading ? 'animate-spin' : ''" class="w-3.5 h-3.5" />
            {{ scriptLoading ? '生成中…' : '沟通话术推荐' }}
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950 hover:border-violet-400 transition-colors disabled:opacity-50"
            :disabled="recommendLoading"
            @click="generateSolution">
            <UIcon :name="recommendLoading ? 'i-lucide-loader-2' : 'i-lucide-lightbulb'" :class="recommendLoading ? 'animate-spin' : ''" class="w-3.5 h-3.5" />
            {{ recommendLoading ? '生成中…' : '利益重构方案推荐' }}
          </button>
        </div>
      </div>

      <!-- TOP: Chat Dialog (flex-1) -->
      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <template v-if="selectedMessages.length">
            <div v-for="msg in selectedMessages" :key="msg.id" class="flex" :class="msg.senderType === 'mediator' ? 'justify-end' : 'justify-start'">
              <div class="max-w-[75%] rounded-lg px-3 py-2" :class="bubbleClass(msg.senderType)">
                <div class="text-xs font-medium mb-1 opacity-60">{{ senderLabel(msg) }}</div>
                <div class="text-base whitespace-pre-wrap leading-relaxed">{{ msg.content }}</div>
                <div class="text-xs mt-1 opacity-40 text-right font-mono">{{ formatTime(msg.createdAt) }}</div>
              </div>
            </div>
          </template>
          <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-center"><p class="text-sm text-gray-400">暂无对话记录</p></div>
          </div>
        </div>
        <!-- Chat Input -->
        <div class="border-t border-gray-200 dark:border-gray-800 p-3">
          <form @submit.prevent="sendQuickMessage" class="flex gap-2">
            <UInput v-model="quickMessage" placeholder="输入消息..." class="flex-1" size="sm" />
            <UButton type="submit" icon="i-lucide-send" size="lg" :disabled="!quickMessage.trim()" class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100" />
          </form>
        </div>
      </div>
    </div>
  </div>

  <!-- Create Case Dialog -->
  <UModal v-model:open="showCreateDialog">
    <template #header>
      <h3 class="text-base font-semibold text-gray-900 dark:text-white">新建案件</h3>
    </template>
    <template #body>
      <form @submit.prevent="handleCreateCase" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">案件标题</label>
          <UInput v-model="newCase.title" placeholder="请输入案件标题" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">案件描述</label>
          <UTextarea v-model="newCase.description" placeholder="请输入案件描述" :rows="3" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">甲方名称</label>
            <UInput v-model="newCase.partyAName" placeholder="甲方" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">乙方名称</label>
            <UInput v-model="newCase.partyBName" placeholder="乙方" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">甲方联系方式</label>
            <UInput v-model="newCase.partyAContact" placeholder="选填" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">乙方联系方式</label>
            <UInput v-model="newCase.partyBContact" placeholder="选填" />
          </div>
        </div>
        <UAlert v-if="createError" color="error" variant="soft" :title="createError" />
      </form>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" size="lg" @click="showCreateDialog = false">取消</UButton>
        <UButton size="lg" class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100" :loading="creating" :disabled="!newCase.title || !newCase.partyAName || !newCase.partyBName" @click="handleCreateCase">
          创建
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- Material Viewer Modal (custom) -->
  <div v-if="viewingMaterial" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="viewingMaterial = null">
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-file-text" class="w-4 h-4 text-blue-500" />
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">{{ viewingMaterialTitle }}</h3>
        </div>
        <button class="text-gray-400 hover:text-gray-600" @click="viewingMaterial = null">
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>
      <div class="px-5 py-4 overflow-y-auto flex-1">
        <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
          {{ viewingMaterialContent }}
        </div>
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end">
        <button class="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg" @click="viewingMaterial = null">关闭</button>
      </div>
    </div>
  </div>

  <!-- File List Modal -->
  <div v-if="viewingFiles" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="viewingFiles = false">
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-paperclip" class="w-4 h-4 text-purple-500" />
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">原始文件</h3>
          <span class="text-xs text-gray-400">({{ caseFiles.length }} 个 · 来源: {{ caseFileDir }})</span>
        </div>
        <button class="text-gray-400 hover:text-gray-600" @click="viewingFiles = false">
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>
      <div v-if="caseFiles.length === 0" class="px-5 py-12 text-center text-sm text-gray-400">
        该案件暂无上传的原始文件
      </div>
      <div v-else class="px-5 py-4 overflow-y-auto flex-1 space-y-2">
        <div v-for="f in caseFiles" :key="f.name"
          class="flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-purple-300 transition-colors">
          <UIcon :name="fileIcon(f.ext)" class="w-5 h-5 shrink-0" :class="fileIconColor(f.ext)" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ f.name }}</div>
            <div class="text-xs text-gray-400">{{ formatSize(f.size) }} · {{ f.mime }}</div>
          </div>
          <button v-if="canPreview(f.ext)"
            class="px-2.5 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 rounded transition-colors"
            @click="previewFile(f)">
            <UIcon name="i-lucide-eye" class="w-3.5 h-3.5 inline -mt-0.5" /> 预览
          </button>
          <a :href="fileUrl(f)" target="_blank" download
            class="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors">
            <UIcon name="i-lucide-download" class="w-3.5 h-3.5 inline -mt-0.5" /> 下载
          </a>
        </div>
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end">
        <button class="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg" @click="viewingFiles = false">关闭</button>
      </div>
    </div>
  </div>

  <!-- File Preview Modal -->
  <div v-if="previewingFile" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" @click.self="previewingFile = null">
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon :name="fileIcon(previewingFile.ext)" class="w-4 h-4 shrink-0" :class="fileIconColor(previewingFile.ext)" />
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{ previewingFile.name }}</h3>
        </div>
        <button class="text-gray-400 hover:text-gray-600 shrink-0" @click="previewingFile = null">
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>
      <div class="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-gray-950">
        <pre v-if="previewingFile.ext === 'txt' || previewingFile.ext === 'md' || previewingFile.ext === 'json'" class="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">{{ previewContent }}</pre>
        <img v-else-if="['png','jpg','jpeg','gif','webp'].includes(previewingFile.ext)" :src="previewContent" class="max-w-full mx-auto" alt="" />
        <iframe v-else-if="previewingFile.ext === 'pdf'" :src="previewContent" class="w-full h-[70vh] bg-white" />
        <div v-else class="text-center text-sm text-gray-400 py-8">该格式暂不支持预览，请下载查看</div>
      </div>
    </div>
  </div>

  <!-- Saved Conversation Viewer Modal -->
  <div v-if="viewingConversation" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="viewingConversation = null">
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon name="i-lucide-message-square-text" class="w-4 h-4 text-emerald-500 shrink-0" />
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{ viewingConversation.title }}</h3>
          <span class="text-xs text-gray-400 shrink-0">({{ viewingConversation.messageCount }} 条)</span>
        </div>
        <button class="text-gray-400 hover:text-gray-600 shrink-0" @click="viewingConversation = null">
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>
      <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-xs text-gray-500">
        案件：<span class="font-mono text-blue-600 dark:text-blue-400">{{ viewingConversation.caseId }}</span>
        <span v-if="viewingConversation.caseTitle" class="ml-2">{{ viewingConversation.caseTitle }}</span>
        <span class="ml-2">· {{ formatDateTime(viewingConversation.createdAt) }}</span>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <div v-for="(m, i) in viewingConversation.messages" :key="i"
          class="flex" :class="m.senderType === 'mediator' ? 'justify-end' : 'justify-start'">
          <div class="max-w-[75%] rounded-lg px-3 py-2"
            :class="m.senderType === 'mediator' ? 'bg-blue-600 text-white' : m.senderType === 'ai' ? 'bg-violet-100 dark:bg-violet-900 text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'">
            <div class="text-xs font-medium mb-1 opacity-70">
              {{ m.senderName || (m.senderType === 'mediator' ? '调解员' : m.senderType === 'ai' ? 'AI' : '当事人') }}
            </div>
            <div class="text-sm whitespace-pre-wrap leading-relaxed">{{ m.content }}</div>
          </div>
        </div>
        <div v-if="!viewingConversation.messages?.length" class="text-center text-sm text-gray-400 py-8">无消息</div>
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end">
        <button class="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg" @click="viewingConversation = null">关闭</button>
      </div>
    </div>
  </div>

  <!-- Solution Recommendation Modal -->
  <div v-if="showSolutionModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showSolutionModal = false">
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/50 dark:to-blue-950/50">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sparkles" class="w-5 h-5 text-violet-600" />
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">利益重构方案推荐</h3>
          <span v-if="solutionGeneratedAt" class="text-xs text-gray-400">{{ formatDateTime(solutionGeneratedAt) }}</span>
        </div>
        <div class="flex items-center gap-1">
          <button v-if="solutionContent" class="text-xs px-2 py-1 text-gray-600 hover:bg-white/60 dark:hover:bg-gray-800 rounded" @click="copySolution">
            <UIcon name="i-lucide-copy" class="w-3.5 h-3.5 inline" /> 复制
          </button>
          <button class="text-gray-400 hover:text-gray-600 ml-1" @click="showSolutionModal = false">
            <UIcon name="i-lucide-x" class="w-5 h-5" />
          </button>
        </div>
      </div>
      <div class="px-5 py-4 overflow-y-auto flex-1">
        <div v-if="recommendLoading" class="flex flex-col items-center justify-center py-16 gap-3">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-violet-500 animate-spin" />
          <p class="text-sm text-gray-500">AI 调解员正在分析案件材料，生成重构方案…</p>
          <p class="text-xs text-gray-400">约需 15-30 秒</p>
        </div>
        <div v-else-if="solutionError" class="text-center py-12">
          <UIcon name="i-lucide-alert-circle" class="w-10 h-10 text-red-400 mx-auto mb-2" />
          <p class="text-sm text-red-600">{{ solutionError }}</p>
        </div>
        <div v-else-if="solutionContent" class="max-w-none solution-content" v-html="renderedSolution" />
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <p class="text-xs text-gray-400">AI 生成仅供参考，需调解员根据实际情况调整；不确定处已标注"需律师/法务/内部审批复核"</p>
        <button class="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg" @click="showSolutionModal = false">关闭</button>
      </div>
    </div>
  </div>

  <!-- Script Recommendation Modal -->
  <div v-if="showScriptModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showScriptModal = false">
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col">
      <div class="shrink-0 px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 flex items-center gap-2">
        <UIcon name="i-lucide-message-circle" class="w-5 h-5 text-blue-600" />
        <h3 class="text-base font-semibold text-gray-900 dark:text-white">沟通话术推荐</h3>
        <span v-if="scriptGeneratedAt" class="text-xs text-gray-400 ml-1">{{ formatDateTime(scriptGeneratedAt) }}</span>
        <div class="ml-auto flex items-center gap-2">
          <button class="px-2.5 py-1 text-xs text-gray-500 hover:bg-white/60 dark:hover:bg-gray-800/60 rounded transition-colors" @click="copyScript">
            <UIcon name="i-lucide-copy" class="w-3.5 h-3.5 inline -mt-0.5" /> 复制
          </button>
          <button class="text-gray-400 hover:text-gray-600" @click="showScriptModal = false">
            <UIcon name="i-lucide-x" class="w-5 h-5" />
          </button>
        </div>
      </div>
      <div class="px-5 py-4 overflow-y-auto flex-1">
        <div v-if="scriptLoading" class="flex items-center justify-center py-12 gap-2 text-sm text-blue-500">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 正在生成话术...
        </div>
        <div v-else-if="scriptError" class="text-sm text-red-500 py-4">{{ scriptError }}</div>
        <div v-else-if="scriptStages.length === 0" class="text-sm text-gray-400 py-12 text-center">暂无内容</div>
        <div v-else class="space-y-3">
          <div v-for="(s, i) in scriptStages" :key="i"
            class="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2 border-b border-blue-200 dark:border-blue-900 bg-blue-100/60 dark:bg-blue-900/30">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">第{{ i + 1 }}步</span>
                <span class="text-sm font-medium text-blue-900 dark:text-blue-200">{{ s.stage }}</span>
              </div>
              <button class="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200" @click="useScript(s.content)">
                <UIcon name="i-lucide-send" class="w-3.5 h-3.5 inline -mt-0.5" /> 填入输入框
              </button>
            </div>
            <div class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ s.content }}</div>
          </div>
        </div>
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <p class="text-xs text-gray-400">AI 生成仅供参考，需调解员根据实际情况调整；敏感法律点已标注"需律师复核"</p>
        <button class="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg" @click="showScriptModal = false">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter()
const auth = useAuth()

const authLoading = ref(true)
const casesLoading = ref(true)
const searchQuery = ref('')
const showCreateDialog = ref(false)
const creating = ref(false)
const createError = ref('')
const selectedCaseId = ref<string | null>(null)
const quickMessage = ref('')

// Case detail data (materials)
const caseDetail = ref<{
  description?: string
  claimsSummary?: string
  evidenceSummary?: string
  documents?: Array<{ id: string; filename: string; originalName: string; mimeType?: string; size?: number }>
} | null>(null)
const viewingMaterial = ref<string | null>(null) // 'description' | 'claims' | 'evidence' | null
const materialsOpen = ref(true)

const materialCount = computed(() => {
  if (!caseDetail.value) return 0
  let n = 0
  if (caseDetail.value.description) n++
  if (caseDetail.value.claimsSummary) n++
  if (caseDetail.value.evidenceSummary) n++
  return n
})

const viewingMaterialTitle = computed(() => {
  switch (viewingMaterial.value) {
    case 'description': return '案件描述'
    case 'claims': return '请求和答辩'
    case 'evidence': return '证据和质证'
    default: return ''
  }
})

const viewingMaterialContent = computed(() => {
  if (!caseDetail.value) return ''
  switch (viewingMaterial.value) {
    case 'description': return caseDetail.value.description || ''
    case 'claims': return caseDetail.value.claimsSummary || ''
    case 'evidence': return caseDetail.value.evidenceSummary || ''
    default: return ''
  }
})

// ============================================================
// Original files (uploads/cases/<caseId>/)
// ============================================================
interface CaseFile { name: string; size: number; mime: string; ext: string }
const caseFiles = ref<CaseFile[]>([])
const caseFileDir = ref<string>('')
const viewingFiles = ref(false)
const previewingFile = ref<CaseFile | null>(null)
const previewContent = ref<string>('')

function canPreview(ext: string) {
  return ['txt', 'md', 'json', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)
}

function fileIcon(ext: string) {
  if (['pdf'].includes(ext)) return 'i-lucide-file-text'
  if (['doc', 'docx'].includes(ext)) return 'i-lucide-file-text'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'i-lucide-image'
  if (['txt', 'md', 'json'].includes(ext)) return 'i-lucide-file-text'
  return 'i-lucide-file'
}

function fileIconColor(ext: string) {
  if (ext === 'pdf') return 'text-red-500'
  if (['doc', 'docx'].includes(ext)) return 'text-blue-500'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'text-emerald-500'
  return 'text-gray-400'
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileUrl(f: CaseFile) {
  return `/api/cases/${selectedCaseId.value}/file?name=${encodeURIComponent(f.name)}`
}

async function openFileList() {
  viewingFiles.value = true
  if (!selectedCaseId.value) return
  try {
    const resp = await $fetch<{ success: boolean; files: CaseFile[]; dir?: string }>(`/api/cases/${selectedCaseId.value}/files`, { credentials: 'include' })
    caseFiles.value = resp.files || []
    caseFileDir.value = resp.dir || ''
  } catch {
    caseFiles.value = []
  }
}

async function previewFile(f: CaseFile) {
  previewingFile.value = f
  previewContent.value = ''
  if (f.ext === 'txt' || f.ext === 'md' || f.ext === 'json') {
    try {
      const resp = await $fetch<string>(fileUrl(f), { credentials: 'include', responseType: 'text' })
      previewContent.value = resp
    } catch {}
  } else {
    previewContent.value = fileUrl(f)
  }
}

// ============================================================
// AI Solution Recommendation
// ============================================================
const showSolutionModal = ref(false)
const recommendLoading = ref(false)
const solutionContent = ref('')
const solutionError = ref('')
const solutionGeneratedAt = ref<string | null>(null)

const renderedSolution = computed(() => renderMarkdown(solutionContent.value))

async function generateSolution() {
  if (!selectedCaseId.value) return
  showSolutionModal.value = true
  recommendLoading.value = true
  solutionContent.value = ''
  solutionError.value = ''
  solutionGeneratedAt.value = null
  try {
    const resp = await $fetch<{ success: boolean; data: { content: string; generatedAt: string } }>(
      `/api/cases/${selectedCaseId.value}/recommend-solution`,
      { method: 'POST', credentials: 'include' },
    )
    if (resp?.success) {
      solutionContent.value = resp.data.content
      solutionGeneratedAt.value = resp.data.generatedAt
    } else {
      solutionError.value = '生成失败：响应异常'
    }
  } catch (err: any) {
    solutionError.value = err?.data?.message || err?.message || '生成失败，请稍后重试'
  } finally {
    recommendLoading.value = false
  }
}

async function copySolution() {
  if (!solutionContent.value) return
  try {
    await navigator.clipboard.writeText(solutionContent.value)
  } catch {}
}

// ============================================================
// AI Script Recommendation (沟通话术推荐)
// ============================================================
const showScriptModal = ref(false)
const scriptLoading = ref(false)
const scriptStages = ref<Array<{ stage: string; content: string }>>([])
const scriptError = ref('')
const scriptGeneratedAt = ref<string | null>(null)

// ============================================================
// Saved conversations (持久化对话快照)
// ============================================================
interface SavedConversation {
  id: string
  caseId: string
  caseTitle?: string
  title: string
  messages?: any[]
  messageCount: number
  createdAt: string
}
const savedConversations = ref<SavedConversation[]>([])
const savingConversation = ref(false)
const viewingConversation = ref<SavedConversation | null>(null)

async function loadSavedConversations() {
  try {
    const resp = await $fetch<{ success: boolean; data: SavedConversation[] }>('/api/conversations', { credentials: 'include' })
    if (resp?.data) savedConversations.value = resp.data
  } catch {}
}

async function saveCurrentConversation() {
  if (!selectedCaseId.value || !selectedMessages.value.length) return
  savingConversation.value = true
  try {
    const resp = await $fetch<{ success: boolean; data: { id: string; title: string } }>(`/api/cases/${selectedCaseId.value}/conversations`, {
      method: 'POST',
      credentials: 'include',
      body: { messages: selectedMessages.value },
    })
    if (resp?.data) {
      await loadSavedConversations()
      // 提示成功（简单用 alert，避免引入额外 UI 依赖）
      alert(`已保存对话：${resp.data.title}`)
    }
  } catch (e: any) {
    alert('保存失败：' + (e?.message || '未知错误'))
  } finally {
    savingConversation.value = false
  }
}

async function openSavedConversation(id: string) {
  try {
    const resp = await $fetch<{ success: boolean; data: SavedConversation }>(`/api/conversations/${id}`, { credentials: 'include' })
    if (resp?.data) viewingConversation.value = resp.data
  } catch {}
}

async function generateScript() {
  if (!selectedCaseId.value) return
  showScriptModal.value = true
  scriptLoading.value = true
  scriptStages.value = []
  scriptError.value = ''
  scriptGeneratedAt.value = null
  try {
    // 构造案件上下文
    const cd: any = caseDetail.value || {}
    const ctx = [
      cd.description && `【案件描述】\n${cd.description}`,
      cd.claimsSummary && `【请求和答辩】\n${cd.claimsSummary}`,
      cd.evidenceSummary && `【证据和质证】\n${cd.evidenceSummary}`,
    ].filter(Boolean).join('\n\n')

    const prompt = `你是一个经验丰富的商事调解专家。请根据以下案件信息，为调解员生成 3-5 步"首轮沟通话术"。

要求：
1. 每步聚焦一个目标（破冰/倾听/共情/聚焦利益/探索选项/推进共识/收尾确认）
2. 语气专业、温和、不评判
3. 每步 80-200 字，使用完整话术（可直接对当事人说）
4. 不要使用 Markdown 标题/加粗/列表符号
5. 对敏感法律点（合同效力、违约责任、诉讼时效）显式标注："⚠️ 需律师复核"

返回严格的 JSON 数组（不要其他说明、不要包裹代码块）：
[
  {"stage": "步骤名称", "content": "完整话术内容..."},
  ...
]

案件信息：
${ctx || '（暂无）'}`

    const resp = await $fetch<{ success: boolean; data: { content: string; generatedAt: string } }>(
      '/api/ai/oneshot',
      {
        method: 'POST',
        credentials: 'include',
        body: {
          system: '你是一个经验丰富的商事调解专家，擅长利益导向调解和温和沟通。请严格按要求格式返回。',
          prompt,
          temperature: 0.5,
        },
      },
    )
    const text = resp?.data?.content || ''
    // 解析 JSON
    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        const arr = JSON.parse(match[0])
        if (Array.isArray(arr) && arr.length) {
          scriptStages.value = arr.map((x: any) => ({
            stage: String(x?.stage || '').slice(0, 40),
            content: String(x?.content || ''),
          })).filter(s => s.content)
          scriptGeneratedAt.value = resp.data.generatedAt
        } else {
          scriptError.value = 'AI 返回格式异常'
        }
      } catch {
        scriptError.value = '解析 AI 返回失败'
      }
    } else {
      scriptError.value = 'AI 未返回有效内容'
    }
  } catch (err: any) {
    scriptError.value = err?.data?.message || err?.message || '生成失败，请稍后重试'
  } finally {
    scriptLoading.value = false
  }
}

async function copyScript() {
  if (!scriptStages.value.length) return
  const text = scriptStages.value.map((s, i) => `第${i + 1}步 · ${s.stage}\n${s.content}`).join('\n\n---\n\n')
  try { await navigator.clipboard.writeText(text) } catch {}
}

function useScript(text: string) {
  quickMessage.value = text
  showScriptModal.value = false
}

function formatDateTime(iso: string) {
  try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }) } catch { return iso }
}

/** Minimal markdown renderer for the solution output (no external dep) */
function renderMarkdown(md: string): string {
  if (!md) return ''
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = md.split('\n')
  const out: string[] = []
  let inTable = false
  let tableRows: string[][] = []
  function flushTable() {
    if (tableRows.length === 0) return
    const head = tableRows[0]
    const body = tableRows.slice(2) // skip separator row
    out.push('<table class="w-full text-xs border-collapse my-2">')
    out.push('<thead><tr>' + head.map(c => `<th class="border border-gray-300 dark:border-gray-700 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-left">${renderInline(c)}</th>`).join('') + '</tr></thead>')
    if (body.length) {
      out.push('<tbody>' + body.map(r => '<tr>' + r.map(c => `<td class="border border-gray-300 dark:border-gray-700 px-2 py-1 align-top">${renderInline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>')
    }
    out.push('</table>')
    tableRows = []
    inTable = false
  }
  function renderInline(s: string): string {
    s = esc(s)
    // bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // list bullet -  - rendered as • for sub-items
    return s
  }
  for (const raw of lines) {
    const line = raw
    // Table row
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim())
      tableRows.push(cells)
      inTable = true
      continue
    }
    if (inTable) flushTable()
    if (/^###\s+/.test(line)) {
      out.push(`<h4 class="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">${renderInline(line.replace(/^###\s+/, ''))}</h4>`)
    } else if (/^##\s+/.test(line)) {
      out.push(`<h3 class="text-base font-semibold text-gray-900 dark:text-white mt-4 mb-2 pb-1 border-b border-gray-200 dark:border-gray-800">${renderInline(line.replace(/^##\s+/, ''))}</h3>`)
    } else if (/^#\s+/.test(line)) {
      out.push(`<h2 class="text-lg font-bold text-gray-900 dark:text-white mt-4 mb-2">${renderInline(line.replace(/^#\s+/, ''))}</h2>`)
    } else if (/^---+$/.test(line.trim())) {
      out.push('<hr class="my-3 border-gray-200 dark:border-gray-800" />')
    } else if (/^[一二三四五六七八九十]+、/.test(line.trim())) {
      out.push(`<h3 class="text-base font-semibold text-violet-700 dark:text-violet-300 mt-4 mb-2">${renderInline(line.trim())}</h3>`)
    } else if (/^[-*]\s+/.test(line.trim())) {
      out.push(`<div class="flex gap-1.5 ml-2 my-0.5 text-sm text-gray-700 dark:text-gray-300"><span class="text-violet-400 shrink-0">•</span><span>${renderInline(line.trim().replace(/^[-*]\s+/, ''))}</span></div>`)
    } else if (/^\d+\.\s+/.test(line.trim())) {
      out.push(`<div class="flex gap-1.5 ml-2 my-0.5 text-sm text-gray-700 dark:text-gray-300"><span class="text-violet-500 font-mono shrink-0">${line.trim().match(/^\d+/)![0]}.</span><span>${renderInline(line.trim().replace(/^\d+\.\s+/, ''))}</span></div>`)
    } else if (line.trim() === '') {
      out.push('<div class="h-1.5"></div>')
    } else {
      out.push(`<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed my-1">${renderInline(line)}</p>`)
    }
  }
  if (inTable) flushTable()
  return out.join('')
}

// Login form state
const loginUsername = ref('')
const loginPassword = ref('')
const loginLoading = ref(false)
const loginError = ref('')

interface CaseItem {
  id: string
  title: string
  description: string | null
  partyAName: string
  partyBName: string
  partyAContact: string | null
  partyBContact: string | null
  status: string
  phase: string
  mediatorId: string | null
  mediatorName: string | null
  accessCode: string
  createdAt: string
  updatedAt: string
}

interface MessageItem {
  id: string
  caseId: string
  senderType: string
  senderId?: string | null
  senderName?: string | null
  content: string
  createdAt: string
}

const cases = ref<CaseItem[]>([])
const allMessages = ref<MessageItem[]>([])
const chat = useChat(computed(() => selectedCaseId.value || ''))

// Sidebar accordion state
const sidebarOpen = reactive({ cases: true, history: false, settings: false, kb: false })

// Right panel mode: '' | 'cases-list' | 'case-detail' | 'kb-upload' | 'kb-view' | 'kb-search' | 'history' | 'settings'
const rightMode = ref<string>('cases-list')

// KB state
const kbQuery = ref('')
const kbSearching = ref(false)
const kbResults = ref<Array<{ path: string; content: string; score: number }>>([])
const kbStats = ref('7569 条记录')
const kbList = ref<Array<{ path: string; rel_path: string; chunks: number }>>([])
const kbListLoading = ref(false)
const kbFileInput = ref<HTMLInputElement | null>(null)
const kbUploadFile = ref<File | null>(null)
const kbUploading = ref(false)
const kbUploadMsg = ref('')
const kbUploadOk = ref(false)

// Case detail computed
const selectedCaseTitle = computed(() => cases.value.find(c => c.id === selectedCaseId.value)?.title || '')
const selectedCaseStatus = computed(() => cases.value.find(c => c.id === selectedCaseId.value)?.status || '')
const selectedCaseParties = computed(() => {
  const c = cases.value.find(c => c.id === selectedCaseId.value)
  return c ? `${c.partyAName} vs ${c.partyBName}` : ''
})

const newCase = reactive({
  title: '',
  description: '',
  partyAName: '',
  partyBName: '',
  partyAContact: '',
  partyBContact: '',
})

onMounted(async () => {
  const user = await auth.fetchUser()
  authLoading.value = false
  if (user) {
    await fetchCases()
    await loadSavedConversations()
  }
})

async function handleLogin() {
  loginError.value = ''
  loginLoading.value = true
  try {
    await auth.login(loginUsername.value.trim(), loginPassword.value)
    await fetchCases()
  } catch (err: any) {
    loginError.value = err.message || '登录失败，请检查用户名和密码'
  } finally {
    loginLoading.value = false
  }
}

async function fetchCases() {
  casesLoading.value = true
  try {
    const data = await $fetch<{ success: boolean; data: CaseItem[]; currentMediatorId?: string; currentMediatorRole?: string }>('/api/cases', {
      credentials: 'include',
    })
    if (data?.data) {
      // Filter: admin sees all, mediator sees only their bound cases
      if (data.currentMediatorRole === 'admin' || !data.currentMediatorId) {
        cases.value = data.data
      } else {
        cases.value = data.data.filter(c => c.mediatorId === data.currentMediatorId)
      }
    }
  } catch (err: any) {
    console.error('fetchCases failed:', err.statusCode, err.message)
    cases.value = []
  } finally {
    casesLoading.value = false
  }
}

const filteredCases = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return cases.value
  return cases.value.filter(c => c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
})

const selectedMessages = computed(() => {
  if (!selectedCaseId.value) return []
  return allMessages.value.filter(m => m.caseId === selectedCaseId.value)
})

let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function startPolling() {
  stopPolling()
  if (!selectedCaseId.value) return
  pollTimer = setInterval(async () => {
    try {
      const resp = await $fetch<{ success: boolean; data: MessageItem[] }>(`/api/chat/messages/${selectedCaseId.value}`, {
        credentials: 'include',
      })
      if (resp?.data) {
        const otherMsgs = allMessages.value.filter(m => m.caseId !== selectedCaseId.value)
        allMessages.value = [...otherMsgs, ...resp.data.map(m => ({ ...m, caseId: selectedCaseId.value! }))]
      }
    } catch {}
  }, 2000)
}

async function selectCase(id: string) {
  selectedCaseId.value = id
  rightMode.value = 'case-detail'
  caseDetail.value = null
  viewingMaterial.value = null
  // 清空当前对话消息：不再默认显示上次留下的记录
  const otherMsgs = allMessages.value.filter(m => m.caseId !== id)
  allMessages.value = otherMsgs
  startPolling()
  try {
    const resp = await $fetch<{ success: boolean; data: { messages: MessageItem[]; description?: string; claimsSummary?: string; evidenceSummary?: string; documents?: any[] } }>(`/api/cases/${id}`, {
      credentials: 'include',
    })
    if (resp?.data) {
      // Store case materials
      caseDetail.value = {
        description: resp.data.description,
        claimsSummary: resp.data.claimsSummary,
        evidenceSummary: resp.data.evidenceSummary,
        documents: resp.data.documents || [],
      }
      caseFiles.value = []
      solutionContent.value = ''
      solutionError.value = ''
      solutionGeneratedAt.value = null
      // 注意：不再加载历史消息，留空给新会话
    }
  } catch {}
  loadSavedConversations()
}

async function sendQuickMessage() {
  const text = quickMessage.value.trim()
  if (!text) return
  quickMessage.value = ''

  try {
    await $fetch('/api/chat/messages', {
      method: 'POST',
      body: {
        caseId: selectedCaseId.value,
        content: text,
        senderType: 'mediator',
        senderId: auth.user.value?.id,
        senderName: auth.user.value?.name || '调解员',
      },
      credentials: 'include',
    })
  } catch {}
}

// ============================================================
// Skill: 首轮沟通话术
// ============================================================
async function openSkill(name: 'first-talk') {
  activeSkill.value = name
  skillLoading.value = true
  skillError.value = ''
  skillScripts.value = []
  currentScriptIndex.value = 0

  // Generate first script only
  try {
    await generateNextScript()
  } catch (err: any) {
    skillError.value = err?.message || '生成失败'
  } finally {
    skillLoading.value = false
  }
}

function buildSkillPrompt(): string {
  return `你是一个商事调解专家。现在需要为案件 ${selectedCaseId.value} 生成首轮沟通话术。

⚠️ 重要约束：首轮沟通只针对一方当事人（申请人${cases.value.find(c => c.id === selectedCaseId.value)?.partyAName || '甲方'}），不要包含对双方的表述，不要说"你们双方"。

## 一、阶段目标
1. 建立中立信任与程序共识（仅对该方当事人）
2. 拆解争议：事实/法律/利益/情绪
3. 确认调解范围、边界与排除项

## 二、工作流
1. 当事人意图识别、用户画像
2. 冲突特征分析
3. 心理引导、情绪疏导

## 三、方法机制
1. 控场：定规则、防打断、控情绪、控时间
2. 中立化：不站队、不评价立场、不建议方案
3. 聚焦：从情绪拉回事实与议题
4. 过滤：剔除无关诉求、明确核心争点
5. 现实检验：评估诉讼成本与调解收益

## 四、核心技能
1. 中立开场话术、程序结构化
2. 积极倾听、复述、总结
3. 开放式提问、澄清式提问
4. 情绪识别、温和控场、重构语言
5. 事实与观点区分，议题框架化

## 五、输出格式
请用以下JSON格式输出3-5个话术建议，全部针对该方当事人：
[
  {"stage": "开场白", "content": "（以\"您好，我是调解员...\"开头，只与该当事人对话）"},
  {"stage": "确认诉求", "content": "..."},
  {"stage": "引导沟通", "content": "..."}
]

禁止出现的表述：你们双方、对方、另一方、两方、两边`
}

function parseScriptStages(text: string): Array<{ stage: string; content: string }> {
  try {
    // Try to find JSON in the response
    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      return JSON.parse(match[0])
    }
    // Fallback: just show as single item
    return [{ stage: '话术建议', content: text }]
  } catch {
    return [{ stage: '话术建议', content: text }]
  }
}

function copyToInput(text: string) {
  quickMessage.value = text
}

// ============================================================
// KB Search
// ============================================================
async function searchKB() {
  const q = kbQuery.value.trim()
  if (!q) return
  rightMode.value = 'kb-search'
  kbSearching.value = true
  kbResults.value = []
  try {
    const resp = await $fetch<{ results: Array<{ path: string; content: string; score: number }> }>('http://localhost:8700/search', {
      method: 'POST',
      body: { query: q, top_k: 5 },
    })
    if (resp?.results) kbResults.value = resp.results
  } catch {}
  kbSearching.value = false
}

async function loadKbList() {
  kbListLoading.value = true
  kbList.value = []
  try {
    const resp = await $fetch<{ documents: Array<{ path: string; rel_path: string; chunks: number }> }>('http://localhost:8700/list', {
      params: { limit: 200 },
    })
    if (resp?.documents) kbList.value = resp.documents
  } catch {}
  kbListLoading.value = false
}

function onKbFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const f = target.files?.[0]
  if (!f) return
  if (!f.name.endsWith('.md')) {
    kbUploadMsg.value = '仅支持 .md 格式'
    kbUploadOk.value = false
    return
  }
  kbUploadFile.value = f
  kbUploadMsg.value = ''
}

async function uploadKbFile() {
  if (!kbUploadFile.value) return
  kbUploading.value = true
  kbUploadMsg.value = ''
  const fd = new FormData()
  fd.append('file', kbUploadFile.value)
  try {
    const resp = await $fetch<{ success: boolean; path: string }>('http://localhost:8700/upload', {
      method: 'POST',
      body: fd,
    })
    if (resp?.success) {
      kbUploadMsg.value = `上传成功：${kbUploadFile.value.name}`
      kbUploadOk.value = true
      kbUploadFile.value = null
      if (kbFileInput.value) kbFileInput.value.value = ''
    }
  } catch (e: any) {
    kbUploadMsg.value = `上传失败：${e?.message || '未知错误'}`
    kbUploadOk.value = false
  }
  kbUploading.value = false
}

function senderLabel(msg: { senderType: string; senderName?: string | null }) {
  if (msg.senderType === 'mediator') return '调解员（您）'
  if (msg.senderType === 'ai') return 'AI助手'
  return msg.senderName || '当事人'
}

function bubbleClass(senderType: string) {
  if (senderType === 'mediator') return 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
  if (senderType === 'ai') return 'bg-blue-50 dark:bg-blue-950/30 text-gray-800 dark:text-gray-200 border border-blue-200 dark:border-blue-900'
  return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
}

function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string) {
  try { return new Date(dateStr).toLocaleDateString('zh-CN') } catch { return dateStr }
}

function getStatusColor(status: string) {
  const map: Record<string, string> = { pending: 'warning', active: 'success', resolved: 'info', closed: 'neutral' }
  return (map[status] || 'neutral') as any
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = { pending: '待处理', active: '进行中', resolved: '已解决', closed: '已关闭' }
  return map[status] || status
}

async function handleCreateCase() {
  creating.value = true
  createError.value = ''
  try {
    const data = await $fetch<{ success: boolean; data: CaseItem }>('/api/cases', {
      method: 'POST',
      body: {
        title: newCase.title,
        description: newCase.description,
        partyAName: newCase.partyAName,
        partyBName: newCase.partyBName,
        partyAContact: newCase.partyAContact,
        partyBContact: newCase.partyBContact,
      },
    })
    if (data?.data) cases.value.unshift(data.data)
    Object.assign(newCase, { title: '', description: '', partyAName: '', partyBName: '', partyAContact: '', partyBContact: '' })
    showCreateDialog.value = false
  } catch (err: any) {
    createError.value = err?.data?.message || err?.message || '创建失败'
  } finally {
    creating.value = false
  }
}

onUnmounted(() => {
  chat.disconnect()
})
</script>
