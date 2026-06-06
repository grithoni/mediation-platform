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
        <div v-if="sidebarOpen.history" class="px-2 pb-2">
          <div class="text-xs text-gray-400 py-4 text-center">绑定案件后将在此显示对话记录</div>
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
          <span class="text-xs text-gray-400">{{ selectedCaseParties }}</span>
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

      <!-- BOTTOM: Skills (left) + Scripts (right), collapsible -->
      <div class="shrink-0 border-t border-gray-200 dark:border-gray-800 h-[35%] min-h-[200px] flex">
        <!-- Bottom-Left: Skills List -->
        <div class="w-44 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-3 overflow-y-auto">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">技能工具</div>
          <button
            class="w-full text-left px-3 py-2 rounded-md text-sm transition-colors mb-1"
            :class="activeSkill === 'first-talk' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'"
            @click="openSkill('first-talk')"
          >
            💬 首轮沟通话术
          </button>
          <div class="text-xs text-gray-400 px-3 py-2">更多开发中...</div>
        </div>

        <!-- Bottom-Right: Sequential Script Wizard -->
        <div class="flex-1 overflow-y-auto bg-blue-50/50 dark:bg-blue-950/10">
          <div v-if="!activeSkill" class="flex items-center justify-center h-full">
            <p class="text-xs text-gray-400">点击左侧技能查看推荐话术</p>
          </div>
          <div v-else-if="skillLoading" class="flex items-center justify-center h-full gap-2 text-sm text-blue-500">
            <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 正在生成...
          </div>
          <div v-else class="p-4 flex flex-col h-full">
            <!-- Header: step indicator -->
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-medium text-blue-700 dark:text-blue-300">智能分析提问 第{{ currentScriptIndex + 1 }}步 · {{ skillScripts[currentScriptIndex]?.stage }}</span>
              <button class="text-blue-400 hover:text-blue-600 text-xs" @click="activeSkill = null">✕</button>
            </div>

            <!-- Progress -->
            <div class="flex gap-1 mb-3">
              <div v-for="(_, i) in skillScripts" :key="i" class="flex-1 h-1.5 rounded-full"
                :class="i <= currentScriptIndex ? 'bg-blue-500' : i === skillScripts.length - 1 && skillLoading ? 'bg-blue-300 animate-pulse' : 'bg-gray-200 dark:bg-gray-700'"></div>
            </div>

            <!-- Stage label -->
            <div class="text-xs text-blue-500 dark:text-blue-400 font-medium mb-2 uppercase tracking-wide">{{ skillScripts[currentScriptIndex]?.stage }}</div>

            <!-- Current script content -->
            <div class="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 overflow-y-auto">
              <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ skillScripts[currentScriptIndex]?.content }}</div>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <button
                class="px-3 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                :disabled="currentScriptIndex === 0"
                @click="prevScript"
              >← 上一步</button>
              <div class="flex gap-2">
                <UButton size="xs" variant="soft" color="blue" @click="useCurrentScript">使用此话术</UButton>
                <button
                  class="px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
                  @click="nextScript"
                >跳过 →</button>
              </div>
            </div>
          </div>
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

// Skill state
const activeSkill = ref<'first-talk' | null>(null)
const skillLoading = ref(false)
const skillError = ref('')
const skillScripts = ref<Array<{ stage: string; content: string }>>([])
const currentScriptIndex = ref(0)

async function generateNextScript() {
  skillLoading.value = true
  skillError.value = ''
  try {
    // Build context: previous scripts + conversation summary
    const prevStages = skillScripts.value.map((s, i) => `第${i + 1}轮(${s.stage}): ${s.content.substring(0, 100)}`).join('\n')
    const msgCount = selectedMessages.value.length
    const lastMsgs = selectedMessages.value.slice(-3).map(m => `[${m.senderName || m.senderType}]: ${m.content.substring(0, 200)}`).join('\n')

    const stageNames = ['开场白', '确认诉求', '引导沟通', '聚焦议题', '总结收尾']
    const nextStage = stageNames[skillScripts.value.length] || '下一步提问'

    const prompt = `你是一个商事调解专家。当前案件: ${selectedCaseId.value}。
现在的对话人是调解员，对方是当事人 ${selectedCaseParties.value.split(' vs ')[0] || '当事人'}。

## 已完成的话术
${prevStages || '（首次沟通）'}

## 最近对话记录
${lastMsgs || '（尚无对话）'}

## 当前进度: 第 ${skillScripts.value.length + 1} 步 - ${nextStage}

请根据对话上下文，生成下一个沟通话术。只输出纯文本话术内容（不要JSON、不要标记、不要解释），以适合直接发送给当事人的口语化表达。`

    const resp = await $fetch<{ success: boolean; data: { content: string } }>('/api/chat/ai', {
      method: 'POST',
      body: {
        caseId: selectedCaseId.value,
        message: prompt,
        senderIdentifier: 'mediator',
        senderName: '调解员',
        skipSave: true,
      },
    })
    if (resp?.data?.content) {
      const text = resp.data.content.replace(/^["'\s]+|["'\s]+$/g, '').trim()
      skillScripts.value.push({ stage: nextStage, content: text })
      currentScriptIndex.value = skillScripts.value.length - 1
    }
  } catch (err: any) {
    skillError.value = err?.message || '生成失败'
  } finally {
    skillLoading.value = false
  }
}

function nextScript() {
  if (skillLoading.value) return
  if (currentScriptIndex.value < skillScripts.value.length - 1) {
    currentScriptIndex.value++
  } else {
    generateNextScript()
  }
}

function useCurrentScript() {
  const script = skillScripts.value[currentScriptIndex.value]
  if (script) {
    copyToInput(script.content)
  }
  // After using, give the mediator time to send. Next click on "跳过" generates the next.
}

function prevScript() {
  if (currentScriptIndex.value > 0) {
    currentScriptIndex.value--
  }
}

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
  startPolling()
  try {
    const resp = await $fetch<{ success: boolean; data: { messages: MessageItem[] } }>(`/api/cases/${id}`, {
      credentials: 'include',
    })
    if (resp?.data?.messages) {
      const otherMsgs = allMessages.value.filter(m => m.caseId !== id)
      const newMsgs = resp.data.messages.map(m => ({ ...m, caseId: id }))
      allMessages.value = [...otherMsgs, ...newMsgs]
    }
  } catch {}
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
