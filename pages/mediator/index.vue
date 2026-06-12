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
          <span class="text-3xl font-semibold text-gray-900 dark:text-white">全时在线的纠纷解决专家</span>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 font-mono mt-1">Always Online Dispute Resolution Expert</p>
        <p class="text-sm text-gray-400 dark:text-gray-500 font-mono mt-2">调解员工作台 · Mediator Workstation</p>
        <p class="text-sm text-gray-500 dark:text-gray-400 font-mono mt-1">mediator sign in</p>
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
    <!-- Left Sidebar -->
    <AdminCaseSidebar
      :cases="cases"
      :cases-loading="casesLoading"
      :selected-case-id="selectedCaseId"
      :right-mode="rightMode"
      :saved-conversations="savedConversations"
      :skill-count="skills.length"
      :tool-count="mcpTools.length"
      :user-name="auth.user.value?.name || ''"
      :user-role="auth.user.value?.role || ''"
      @select-case="selectCase"
      @change-mode="onSidebarModeChange"
      @open-conversation="openSavedConversation"
      @logout="auth.logout()"
    />

    <!-- Notification Banner: party requesting mediator -->
    <div
      v-if="pendingRequestCases.length > 0 && !selectedCaseId"
      class="fixed top-0 left-0 right-0 z-40 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center gap-3 shadow-sm"
      style="left: 280px;"
    >
      <UIcon name="i-lucide-bell-ring" class="w-5 h-5 text-amber-600 dark:text-amber-400 animate-pulse shrink-0" />
      <span class="text-sm text-amber-800 dark:text-amber-200">
        <strong>{{ pendingRequestCases.length }}</strong> 个案件的当事人请求介入：
      </span>
      <button
        v-for="c in pendingRequestCases"
        :key="c.id"
        class="px-3 py-1 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors"
        @click="selectCase(c.id)"
      >
        {{ c.id }}
      </button>
    </div>

    <!-- Right: KB panels (when no case selected) -->
    <AdminKnowledgePanel
      v-if="isKbMode && !selectedCaseId"
      :mode="rightMode"
      :kb-list="kbList"
      :kb-list-loading="kbListLoading"
      :kb-stats="kbStats"
      :kb-tree="kbTree"
      :results="kbResults"
      :searching="kbSearching"
      :uploading="kbUploading"
      :upload-msg="kbUploadMsg"
      :upload-ok="kbUploadOk"
      @search="searchKB"
      @upload="uploadKbFile"
    />

    <!-- Right: Settings panels (when no case selected) -->
    <AdminSettingsPanel
      v-else-if="isSettingsMode && !selectedCaseId"
      :mode="rightMode"
      :skills="skills"
      :skill-uploading="skillUploading"
      :skill-upload-msg="skillUploadMsg"
      :skill-upload-ok="skillUploadOk"
      :mcp-tools="mcpTools"
      @upload-skill="uploadSkillFile"
      @toggle-skill="toggleSkill"
      @delete-skill="deleteSkill"
      @add-tool="openMcpToolForm()"
      @edit-tool="openMcpToolForm($event)"
      @toggle-tool="toggleMcpTool"
      @delete-tool="deleteMcpTool"
    />

    <!-- Right: Cases List -->
    <div v-else-if="rightMode === 'cases-list' && !selectedCaseId" class="flex-1 flex flex-col bg-white dark:bg-gray-900">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-folder" class="w-5 h-5 text-blue-600" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">我的案件</span>
        <span class="text-xs text-gray-400 ml-auto">{{ cases.length }} 个案件</span>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <div v-if="casesLoading" class="flex items-center justify-center py-12 gap-2 text-sm text-blue-500">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 加载中...
        </div>
        <div v-else-if="cases.length">
          <div v-for="c in cases" :key="c.id"
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

    <!-- Right: History List -->
    <div v-else-if="rightMode === 'history' && !selectedCaseId" class="flex-1 flex flex-col bg-white dark:bg-gray-900">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-message-square" class="w-5 h-5 text-blue-600" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">近期对话</span>
      </div>
      <div class="flex-1 flex items-center justify-center">
        <p class="text-sm text-gray-400">绑定案件后将在此显示对话记录</p>
      </div>
    </div>

    <!-- Right: Empty State -->
    <div v-else-if="!selectedCaseId && rightMode === ''" class="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
      <div class="text-center">
        <UIcon name="i-lucide-scale" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">调解员工作台</h2>
        <p class="text-sm text-gray-400 dark:text-gray-500">选择左侧案件开始工作</p>
      </div>
    </div>

    <!-- Right: Case Detail -->
    <AdminCaseDetailView
      v-else-if="selectedCaseId"
      ref="caseDetailRef"
      :case-id="selectedCaseId"
      :case-title="selectedCaseTitle"
      :case-status="selectedCaseStatus"
      :parties="selectedCaseParties"
      :case-detail="caseDetail"
      :messages="selectedMessages"
      :file-count="caseFiles.length"
      :saving="savingConversation"
      :recommend-loading="recommendLoading"
      :law-search-loading="lawSearchLoading"
      :case-search-loading="caseSearchLoading"
      :reply-mode="replyMode"
      :suggestion="currentSuggestion"
      :auto-replying="autoReplying"
      @save-conversation="saveCurrentConversation"
      @view-material="viewMaterial($event)"
      @open-files="openFileList"
      @generate-solution="generateSolution"
      @search-law="searchLaw"
      @search-cases="searchCases"
      @send-message="handleSendMessage"
      @change-reply-mode="changeReplyMode"
      @use-suggestion="useSuggestion"
      @edit-suggestion="editSuggestion"
      @dismiss-suggestion="dismissSuggestion"
    />
  </div>

  <!-- Material Viewer Modal -->
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
        <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ viewingMaterialContent }}</div>
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
      <div v-if="caseFiles.length === 0" class="px-5 py-12 text-center text-sm text-gray-400">该案件暂无上传的原始文件</div>
      <div v-else class="px-5 py-4 overflow-y-auto flex-1 space-y-2">
        <div v-for="f in caseFiles" :key="f.name"
          class="flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-purple-300 transition-colors">
          <UIcon :name="fileIcon(f.ext)" class="w-5 h-5 shrink-0" :class="fileIconColor(f.ext)" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ f.name }}</div>
            <div class="text-xs text-gray-400">{{ formatSize(f.size) }} · {{ f.mime }}</div>
          </div>
          <button v-if="canPreview(f.ext)" class="px-2.5 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 rounded transition-colors" @click="previewFile(f)">
            <UIcon name="i-lucide-eye" class="w-3.5 h-3.5 inline -mt-0.5" /> 预览
          </button>
          <a :href="fileUrl(f)" target="_blank" download class="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors">
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
        <pre v-if="['txt','md','json'].includes(previewingFile.ext)" class="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">{{ previewContent }}</pre>
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
        <div v-for="(m, i) in viewingConversation.messages" :key="i" class="flex" :class="m.senderType === 'mediator' ? 'justify-end' : 'justify-start'">
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
          <p class="text-sm text-gray-500">AI 调解员正在分析案件材料，生成重构方案...</p>
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

  <!-- Law Search Modal (法条检索) -->
  <div v-if="showLawSearchModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showLawSearchModal = false">
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-book-open" class="w-5 h-5 text-blue-600" />
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">法条检索</h3>
          <span v-if="lawSearchResults.length" class="text-xs text-gray-400">找到 {{ lawSearchResults.length }} 条</span>
        </div>
        <div class="flex items-center gap-1">
          <button v-if="lawSearchResults.length" class="text-xs px-2 py-1 text-gray-600 hover:bg-white/60 dark:hover:bg-gray-800 rounded" @click="copyAllLawResults">
            <UIcon name="i-lucide-copy" class="w-3.5 h-3.5 inline" /> 复制全部
          </button>
          <button class="text-gray-400 hover:text-gray-600 ml-1" @click="showLawSearchModal = false">
            <UIcon name="i-lucide-x" class="w-5 h-5" />
          </button>
        </div>
      </div>
      <div class="px-5 py-4 overflow-y-auto flex-1">
        <div v-if="lawSearchLoading" class="flex flex-col items-center justify-center py-16 gap-3">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-500 animate-spin" />
          <p class="text-sm text-gray-500">正在检索相关法条...</p>
        </div>
        <div v-else-if="lawSearchError" class="text-center py-12">
          <UIcon name="i-lucide-alert-circle" class="w-10 h-10 text-amber-400 mx-auto mb-2" />
          <p class="text-sm text-amber-600">{{ lawSearchError }}</p>
        </div>
        <div v-else-if="lawSearchResults.length" class="space-y-4">
          <div v-for="(r, i) in lawSearchResults" :key="i"
            class="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2.5 bg-blue-50 dark:bg-blue-950/30 border-b border-gray-200 dark:border-gray-800">
              <div class="flex items-center gap-2 min-w-0">
                <UIcon name="i-lucide-scale" class="w-4 h-4 text-blue-600 shrink-0" />
                <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ r.fileName }}</span>
                <span v-if="r.dirName" class="text-xs text-gray-400 shrink-0">/ {{ r.dirName }}</span>
                <span class="text-xs text-gray-400 shrink-0 font-mono">score: {{ r.score }}</span>
              </div>
              <button class="shrink-0 text-xs px-2 py-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors" @click="copyLawContent(r.content)">
                <UIcon name="i-lucide-copy" class="w-3.5 h-3.5 inline" /> 复制
              </button>
            </div>
            <div class="px-4 py-3">
              <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed select-text">{{ r.content }}</div>
              <div class="mt-2 text-xs text-gray-400">来源：{{ r.path }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <p class="text-xs text-gray-400">法条检索结果仅供参考，以官方法律文本为准</p>
        <button class="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg" @click="showLawSearchModal = false">关闭</button>
      </div>
    </div>
  </div>

  <!-- Case Search Modal (类案推荐) -->
  <div v-if="showCaseSearchModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showCaseSearchModal = false">
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-file-search" class="w-5 h-5 text-emerald-600" />
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">类案推荐</h3>
          <span v-if="caseSearchResults.length" class="text-xs text-gray-400">找到 {{ caseSearchResults.length }} 个相似案例</span>
        </div>
        <button class="text-gray-400 hover:text-gray-600" @click="showCaseSearchModal = false">
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>
      <div class="px-5 py-4 overflow-y-auto flex-1">
        <div v-if="caseSearchLoading" class="flex flex-col items-center justify-center py-16 gap-3">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-emerald-500 animate-spin" />
          <p class="text-sm text-gray-500">正在检索相似案例并生成摘要...</p>
          <p class="text-xs text-gray-400">约需 10-20 秒</p>
        </div>
        <div v-else-if="caseSearchError" class="text-center py-12">
          <UIcon name="i-lucide-alert-circle" class="w-10 h-10 text-amber-400 mx-auto mb-2" />
          <p class="text-sm text-amber-600">{{ caseSearchError }}</p>
        </div>
        <div v-else-if="caseSearchResults.length" class="space-y-4">
          <div v-for="(c, i) in caseSearchResults" :key="i"
            class="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border-b border-gray-200 dark:border-gray-800">
              <div class="flex items-center gap-2 min-w-0">
                <UIcon name="i-lucide-file-text" class="w-4 h-4 text-emerald-600 shrink-0" />
                <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ c.fileName }}</span>
                <span v-if="c.dirName" class="text-xs text-gray-400 shrink-0">/ {{ c.dirName }}</span>
              </div>
              <button class="shrink-0 text-xs px-2.5 py-1 text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-800 rounded transition-colors font-medium" @click="downloadCaseFile(c.path)">
                <UIcon name="i-lucide-download" class="w-3.5 h-3.5 inline -mt-0.5" /> 下载裁决书
              </button>
            </div>
            <div class="px-4 py-3">
              <div class="text-xs text-gray-400 mb-2">来源：{{ c.path }}</div>
              <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ c.summary }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <p class="text-xs text-gray-400">类案推荐仅供参考，具体裁决以原文为准</p>
        <button class="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg" @click="showCaseSearchModal = false">关闭</button>
      </div>
    </div>
  </div>

  <!-- MCP Tool Form Modal -->
  <div v-if="mcpFormOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="mcpFormOpen = false">
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-wrench" class="w-4 h-4 text-violet-500" />
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">{{ mcpEditing?.id ? '编辑 MCP 工具' : '新增 MCP 工具' }}</h3>
        </div>
        <button class="text-gray-400 hover:text-gray-600" @click="mcpFormOpen = false">
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>
      <div class="px-5 py-4 overflow-y-auto flex-1 space-y-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">名称 *</label>
          <input v-model="mcpEditing.name" type="text" placeholder="如：文件系统工具" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">描述</label>
          <input v-model="mcpEditing.description" type="text" placeholder="工具功能简述" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">传输方式 *</label>
          <div class="flex gap-2">
            <button class="flex-1 px-3 py-2 text-sm rounded-md border transition-colors" :class="mcpEditing.transport === 'stdio' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-300 dark:border-gray-700 text-gray-600 hover:bg-gray-50'" @click="mcpEditing.transport = 'stdio'">
              <UIcon name="i-lucide-terminal" class="w-3.5 h-3.5 inline -mt-0.5" /> stdio
            </button>
            <button class="flex-1 px-3 py-2 text-sm rounded-md border transition-colors" :class="mcpEditing.transport === 'http' ? 'bg-sky-50 border-sky-300 text-sky-700' : 'border-gray-300 dark:border-gray-700 text-gray-600 hover:bg-gray-50'" @click="mcpEditing.transport = 'http'">
              <UIcon name="i-lucide-globe" class="w-3.5 h-3.5 inline -mt-0.5" /> http
            </button>
          </div>
        </div>
        <div v-if="mcpEditing.transport === 'stdio'">
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">命令 *</label>
          <input v-model="mcpEditing.command" type="text" placeholder="如：npx -y @modelcontextprotocol/server-filesystem /tmp" class="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <div v-if="mcpEditing.transport === 'http'">
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">URL *</label>
          <input v-model="mcpEditing.url" type="text" placeholder="https://example.com/mcp" class="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">环境变量 (JSON, 可选)</label>
          <textarea v-model="mcpEditing.envJson" rows="3" placeholder='{"API_KEY": "xxx"}' class="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"></textarea>
        </div>
        <div v-if="mcpFormError" class="text-xs text-red-500">{{ mcpFormError }}</div>
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
        <button class="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg" @click="mcpFormOpen = false">取消</button>
        <button class="px-4 py-1.5 text-sm bg-violet-500 hover:bg-violet-600 text-white rounded-lg disabled:opacity-50" :disabled="mcpFormSaving" @click="saveMcpTool()">{{ mcpFormSaving ? '保存中...' : '保存' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const auth = useAuth()

// ============================================================
// Auth & Login
// ============================================================
const authLoading = ref(true)
const loginUsername = ref('')
const loginPassword = ref('')
const loginLoading = ref(false)
const loginError = ref('')

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

// ============================================================
// Core state
// ============================================================
interface CaseItem {
  id: string; title: string; description: string | null; partyAName: string; partyBName: string
  partyAContact: string | null; partyBContact: string | null; status: string; phase: string
  mediatorId: string | null; mediatorName: string | null; mediatorRequestedAt: number | null; accessCode: string; createdAt: string; updatedAt: string
}
interface MessageItem {
  id: string; caseId: string; senderType: string; senderId?: string | null; senderName?: string | null; content: string; createdAt: string
}

const cases = ref<CaseItem[]>([])
const casesLoading = ref(true)
const selectedCaseId = ref<string | null>(null)
const allMessages = ref<MessageItem[]>([])
const chat = useChat(computed(() => selectedCaseId.value || ''))
const rightMode = ref<string>('cases-list')
const caseDetailRef = ref<InstanceType<typeof import('../../components/admin/CaseDetailView.vue')['default']> | null>(null)

// Reply mode state
const replyMode = ref<'auto' | 'manual'>('manual')
const currentSuggestion = ref<string | null>(null)
const autoReplying = ref(false)
let lastPartyMsgId = '' // Track last party message to avoid duplicate suggestions

// Law search state
const lawSearchLoading = ref(false)
const lawSearchResults = ref<Array<{ path: string; fileName: string; dirName: string; content: string; score: number }>>([])
const showLawSearchModal = ref(false)
const lawSearchError = ref('')

// Case search state
const caseSearchLoading = ref(false)
const caseSearchResults = ref<Array<{ path: string; fileName: string; dirName: string; summary: string }>>([])
const showCaseSearchModal = ref(false)
const caseSearchError = ref('')

const isKbMode = computed(() => ['kb-upload', 'kb-view', 'kb-search'].includes(rightMode.value))
const pendingRequestCases = computed(() => cases.value.filter(c => c.mediatorRequestedAt))
const isSettingsMode = computed(() => ['skills', 'tools'].includes(rightMode.value))

const selectedCaseTitle = computed(() => cases.value.find(c => c.id === selectedCaseId.value)?.title || '')
const selectedCaseStatus = computed(() => cases.value.find(c => c.id === selectedCaseId.value)?.status || '')
const selectedCaseParties = computed(() => {
  const c = cases.value.find(c => c.id === selectedCaseId.value)
  return c ? `${c.partyAName} vs ${c.partyBName}` : ''
})
const selectedMessages = computed(() => {
  if (!selectedCaseId.value) return []
  return allMessages.value.filter(m => m.caseId === selectedCaseId.value)
})

// ============================================================
// Case fetching
// ============================================================
onMounted(async () => {
  const user = await auth.fetchUser()
  authLoading.value = false
  if (user) {
    await fetchCases()
    await loadSavedConversations()
  }
})

async function fetchCases() {
  casesLoading.value = true
  try {
    const data = await $fetch<{ success: boolean; data: CaseItem[]; currentMediatorId?: string; currentMediatorRole?: string }>('/api/cases', { credentials: 'include' })
    if (data?.data) {
      cases.value = (data.currentMediatorRole === 'admin' || !data.currentMediatorId) ? data.data : data.data.filter(c => c.mediatorId === data.currentMediatorId)
    }
  } catch (err: any) {
    console.error('fetchCases failed:', err.statusCode, err.message)
    cases.value = []
  } finally {
    casesLoading.value = false
  }
}

// ============================================================
// Case selection & polling
// ============================================================
let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function startPolling() {
  stopPolling()
  if (!selectedCaseId.value) return
  pollTimer = setInterval(async () => {
    try {
      const resp = await $fetch<{ success: boolean; data: MessageItem[] }>(`/api/chat/messages/${selectedCaseId.value}`, { credentials: 'include' })
      if (resp?.data) {
        const otherMsgs = allMessages.value.filter(m => m.caseId !== selectedCaseId.value)
        allMessages.value = [...otherMsgs, ...resp.data.map(m => ({ ...m, caseId: selectedCaseId.value! }))]
      }
    } catch {}
  }, 2000)
}

const caseDetail = ref<{ description?: string; claimsSummary?: string; evidenceSummary?: string; documents?: any[] } | null>(null)

async function selectCase(id: string) {
  selectedCaseId.value = id
  rightMode.value = 'case-detail'
  caseDetail.value = null
  viewingMaterial.value = null
  allMessages.value = allMessages.value.filter(m => m.caseId !== id)
  startPolling()
  try {
    const resp = await $fetch<{ success: boolean; data: { messages: MessageItem[]; description?: string; claimsSummary?: string; evidenceSummary?: string; documents?: any[] } }>(`/api/cases/${id}`, { credentials: 'include' })
    if (resp?.data) {
      caseDetail.value = { description: resp.data.description, claimsSummary: resp.data.claimsSummary, evidenceSummary: resp.data.evidenceSummary, documents: resp.data.documents || [] }
      caseFiles.value = []
      solutionContent.value = ''
      solutionError.value = ''
      solutionGeneratedAt.value = null
      lawSearchResults.value = []
      lawSearchError.value = ''
      caseSearchResults.value = []
      caseSearchError.value = ''
    }
  } catch {}
  loadSavedConversations()
}

function onSidebarModeChange(mode: string) {
  // Clear case selection when switching to non-case modes (KB, settings, etc.)
  // so that the right panel shows the correct view instead of case detail.
  selectedCaseId.value = null
  stopPolling()
  rightMode.value = mode
  if (mode === 'kb-view') loadKbList()
  if (mode === 'skills') loadSkills()
  if (mode === 'tools') loadMcpTools()
}

// ============================================================
// Send message from CaseDetailView
// ============================================================
async function handleSendMessage(text: string) {
  if (!text.trim()) return
  try {
    await $fetch('/api/chat/messages', {
      method: 'POST',
      body: { caseId: selectedCaseId.value, content: text, senderType: 'mediator', senderId: auth.user.value?.id, senderName: auth.user.value?.name || '调解员' },
      credentials: 'include',
    })
    currentSuggestion.value = null // Clear suggestion after sending
  } catch {}
}

// ============================================================
// Reply mode management
// ============================================================
function changeReplyMode(mode: 'auto' | 'manual') {
  replyMode.value = mode
  if (mode === 'auto') {
    currentSuggestion.value = null // Clear any pending suggestion
  }
}

function useSuggestion(text: string) {
  if (caseDetailRef.value) {
    caseDetailRef.value.quickMessage = text
  }
  currentSuggestion.value = null
}

function editSuggestion(text: string) {
  if (caseDetailRef.value) {
    caseDetailRef.value.quickMessage = text
  }
  // Keep suggestion visible until they send
}

function dismissSuggestion() {
  currentSuggestion.value = null
}

// ============================================================
// Detect new party messages and trigger suggestion/auto-reply
// ============================================================
watch(() => selectedMessages.value, async (msgs) => {
  if (!selectedCaseId.value || !msgs.length) return

  // Find the latest party message
  const partyMsgs = msgs.filter(m => m.senderType === 'party')
  if (!partyMsgs.length) return

  const latestPartyMsg = partyMsgs[partyMsgs.length - 1]
  if (latestPartyMsg.id === lastPartyMsgId) return // Already processed
  lastPartyMsgId = latestPartyMsg.id

  // Don't generate if mediator just sent a message (avoid loops)
  const lastMsg = msgs[msgs.length - 1]
  if (lastMsg.senderType === 'mediator') return

  // Generate suggestion or auto-reply based on mode
  if (replyMode.value === 'auto') {
    await generateAutoReply(latestPartyMsg.content)
  } else {
    await generateSuggestion(latestPartyMsg.content)
  }
}, { deep: true })

async function generateSuggestion(partyMessage: string) {
  if (!selectedCaseId.value) return
  try {
    const resp = await $fetch<{ success: boolean; data: { content: string } }>('/api/chat/suggest-reply', {
      method: 'POST',
      body: { caseId: selectedCaseId.value, partyMessage, autoMode: false },
      credentials: 'include',
    })
    if (resp?.success) {
      currentSuggestion.value = resp.data.content
    }
  } catch (err) {
    console.error('[suggest] Failed:', err)
  }
}

async function generateAutoReply(partyMessage: string) {
  if (!selectedCaseId.value) return
  autoReplying.value = true
  try {
    const resp = await $fetch<{ success: boolean; data: { content: string } }>('/api/chat/suggest-reply', {
      method: 'POST',
      body: { caseId: selectedCaseId.value, partyMessage, autoMode: true },
      credentials: 'include',
    })
    if (resp?.success) {
      // Auto-send as mediator message
      await handleSendMessage(resp.data.content)
    }
  } catch (err) {
    console.error('[auto-reply] Failed:', err)
  } finally {
    autoReplying.value = false
  }
}

// ============================================================
// Material viewer
// ============================================================
const viewingMaterial = ref<string | null>(null)
function viewMaterial(type: string) { viewingMaterial.value = type }

const viewingMaterialTitle = computed(() => {
  const map: Record<string, string> = { description: '案件描述', claims: '请求和答辩', evidence: '证据和质证' }
  return map[viewingMaterial.value || ''] || ''
})
const viewingMaterialContent = computed(() => {
  if (!caseDetail.value) return ''
  const map: Record<string, string> = { description: caseDetail.value.description || '', claims: caseDetail.value.claimsSummary || '', evidence: caseDetail.value.evidenceSummary || '' }
  return map[viewingMaterial.value || ''] || ''
})

// ============================================================
// File operations
// ============================================================
interface CaseFile { name: string; size: number; mime: string; ext: string }
const caseFiles = ref<CaseFile[]>([])
const caseFileDir = ref('')
const viewingFiles = ref(false)
const previewingFile = ref<CaseFile | null>(null)
const previewContent = ref('')

function canPreview(ext: string) { return ['txt','md','json','pdf','png','jpg','jpeg','gif','webp'].includes(ext) }
function fileIcon(ext: string) { return ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'i-lucide-image' : 'i-lucide-file-text' }
function fileIconColor(ext: string) { if (ext === 'pdf') return 'text-red-500'; if (['doc','docx'].includes(ext)) return 'text-blue-500'; if (['png','jpg','jpeg','gif','webp'].includes(ext)) return 'text-emerald-500'; return 'text-gray-400' }
function formatSize(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(1)} MB` }
function fileUrl(f: CaseFile) { return `/api/cases/${selectedCaseId.value}/file?name=${encodeURIComponent(f.name)}` }

async function openFileList() {
  viewingFiles.value = true
  if (!selectedCaseId.value) return
  try {
    const resp = await $fetch<{ success: boolean; files: CaseFile[]; dir?: string }>(`/api/cases/${selectedCaseId.value}/files`, { credentials: 'include' })
    caseFiles.value = resp.files || []
    caseFileDir.value = resp.dir || ''
  } catch { caseFiles.value = [] }
}

async function previewFile(f: CaseFile) {
  previewingFile.value = f
  previewContent.value = ''
  if (['txt','md','json'].includes(f.ext)) {
    try { previewContent.value = await $fetch<string>(fileUrl(f), { credentials: 'include', responseType: 'text' }) } catch {}
  } else {
    previewContent.value = fileUrl(f)
  }
}

// ============================================================
// Skills
// ============================================================
interface Skill { id: string; name: string; version: string; description: string; fileCount: number; installedAt: string; enabled: boolean }
const skills = ref<Skill[]>([])
const skillUploading = ref(false)
const skillUploadMsg = ref('')
const skillUploadOk = ref(false)

async function loadSkills() {
  try { const resp = await $fetch<{ success: boolean; skills: Skill[] }>('/api/skills', { credentials: 'include' }); if (resp?.skills) skills.value = resp.skills } catch { skills.value = [] }
}

async function uploadSkillFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.name.endsWith('.zip')) { skillUploadMsg.value = '请上传 .zip 格式文件'; skillUploadOk.value = false; return }
  skillUploading.value = true; skillUploadMsg.value = ''
  const form = new FormData(); form.append('file', file)
  try {
    const resp = await $fetch<{ success: boolean; skill?: Skill; error?: string }>('/api/skills', { method: 'POST', body: form, credentials: 'include' })
    if (resp?.success) { skillUploadMsg.value = `已安装：${resp.skill?.name || file.name}`; skillUploadOk.value = true; await loadSkills() }
    else { skillUploadMsg.value = resp?.error || '上传失败'; skillUploadOk.value = false }
  } catch (err: any) { skillUploadMsg.value = err?.data?.error || err?.message || '上传失败'; skillUploadOk.value = false }
  finally { skillUploading.value = false; input.value = '' }
}

async function toggleSkill(id: string) { await $fetch(`/api/skills/${id}/toggle`, { method: 'POST', credentials: 'include' }); await loadSkills() }
async function deleteSkill(id: string) { if (!confirm('确认卸载该技能？')) return; await $fetch(`/api/skills/${id}`, { method: 'DELETE', credentials: 'include' }); await loadSkills() }

// ============================================================
// MCP Tools
// ============================================================
interface McpTool { id: string; name: string; description: string; transport: 'stdio' | 'http'; command?: string; url?: string; envJson?: string; enabled: boolean }
const mcpTools = ref<McpTool[]>([])
async function loadMcpTools() { try { const resp = await $fetch<{ success: boolean; tools: McpTool[] }>('/api/mcp/tools', { credentials: 'include' }); if (resp?.tools) mcpTools.value = resp.tools } catch { mcpTools.value = [] } }

const mcpFormOpen = ref(false)
const mcpFormSaving = ref(false)
const mcpFormError = ref('')
const mcpEditing = ref<McpTool>({ id: '', name: '', description: '', transport: 'stdio', command: '', url: '', envJson: '', enabled: true })

function openMcpToolForm(tool?: McpTool) {
  mcpFormError.value = ''
  mcpEditing.value = tool ? { ...tool } : { id: '', name: '', description: '', transport: 'stdio', command: '', url: '', envJson: '', enabled: true }
  mcpFormOpen.value = true
}

async function saveMcpTool() {
  if (!mcpEditing.value.name.trim()) { mcpFormError.value = '请输入名称'; return }
  if (mcpEditing.value.transport === 'stdio' && !mcpEditing.value.command?.trim()) { mcpFormError.value = 'stdio 传输需要命令'; return }
  if (mcpEditing.value.transport === 'http' && !mcpEditing.value.url?.trim()) { mcpFormError.value = 'http 传输需要 URL'; return }
  mcpFormSaving.value = true; mcpFormError.value = ''
  try {
    if (mcpEditing.value.envJson?.trim()) { try { JSON.parse(mcpEditing.value.envJson) } catch { mcpFormError.value = '环境变量 JSON 格式错误'; mcpFormSaving.value = false; return } }
    const payload = { ...mcpEditing.value }
    if (mcpEditing.value.id) { await $fetch(`/api/mcp/tools/${mcpEditing.value.id}`, { method: 'PUT', body: payload, credentials: 'include' }) }
    else { delete (payload as any).id; await $fetch('/api/mcp/tools', { method: 'POST', body: payload, credentials: 'include' }) }
    mcpFormOpen.value = false; await loadMcpTools()
  } catch (err: any) { mcpFormError.value = err?.data?.error || err?.message || '保存失败' }
  finally { mcpFormSaving.value = false }
}

async function toggleMcpTool(id: string) { await $fetch(`/api/mcp/tools/${id}/toggle`, { method: 'POST', credentials: 'include' }); await loadMcpTools() }
async function deleteMcpTool(id: string) { if (!confirm('确认删除该工具？')) return; await $fetch(`/api/mcp/tools/${id}`, { method: 'DELETE', credentials: 'include' }); await loadMcpTools() }

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
  showSolutionModal.value = true; recommendLoading.value = true; solutionContent.value = ''; solutionError.value = ''; solutionGeneratedAt.value = null
  try {
    const resp = await $fetch<{ success: boolean; data: { content: string; generatedAt: string } }>(`/api/cases/${selectedCaseId.value}/recommend-solution`, { method: 'POST', credentials: 'include' })
    if (resp?.success) { solutionContent.value = resp.data.content; solutionGeneratedAt.value = resp.data.generatedAt }
    else { solutionError.value = '生成失败：响应异常' }
  } catch (err: any) { solutionError.value = err?.data?.message || err?.message || '生成失败，请稍后重试' }
  finally { recommendLoading.value = false }
}

async function copySolution() { if (solutionContent.value) try { await navigator.clipboard.writeText(solutionContent.value) } catch {} }

// ============================================================
// AI Law Search (法条检索)
// ============================================================
async function searchLaw() {
  if (!selectedCaseId.value) return
  showLawSearchModal.value = true; lawSearchLoading.value = true; lawSearchResults.value = []; lawSearchError.value = ''
  try {
    const resp = await $fetch<{ success: boolean; data: { results: Array<{ path: string; fileName: string; dirName: string; content: string; score: number }>; message?: string } }>(
      `/api/cases/${selectedCaseId.value}/search-law`, { method: 'POST', credentials: 'include' }
    )
    if (resp?.success) {
      lawSearchResults.value = resp.data.results || []
      if (!lawSearchResults.value.length) lawSearchError.value = resp.data.message || '未找到相关法条'
    }
  } catch (err: any) { lawSearchError.value = err?.data?.message || err?.message || '检索失败' }
  finally { lawSearchLoading.value = false }
}

async function copyLawContent(content: string) {
  try { await navigator.clipboard.writeText(content) } catch {}
}

async function copyAllLawResults() {
  const text = lawSearchResults.value.map(r => `【${r.fileName}】来源：${r.path}\n${r.content}`).join('\n\n---\n\n')
  try { await navigator.clipboard.writeText(text) } catch {}
}

// ============================================================
// AI Case Search (类案推荐)
// ============================================================
async function searchCases() {
  if (!selectedCaseId.value) return
  showCaseSearchModal.value = true; caseSearchLoading.value = true; caseSearchResults.value = []; caseSearchError.value = ''
  try {
    const resp = await $fetch<{ success: boolean; data: { cases: Array<{ path: string; fileName: string; dirName: string; summary: string }>; message?: string } }>(
      `/api/cases/${selectedCaseId.value}/search-cases`, { method: 'POST', credentials: 'include' }
    )
    if (resp?.success) {
      caseSearchResults.value = resp.data.cases || []
      if (!caseSearchResults.value.length) caseSearchError.value = resp.data.message || '未找到相似案例'
    }
  } catch (err: any) { caseSearchError.value = err?.data?.message || err?.message || '检索失败' }
  finally { caseSearchLoading.value = false }
}

function downloadCaseFile(path: string) {
  window.open(`/api/kb/file?path=${encodeURIComponent(path)}`, '_blank')
}

// ============================================================
// Saved conversations
// ============================================================
interface SavedConversation { id: string; caseId: string; caseTitle?: string; title: string; messages?: any[]; messageCount: number; createdAt: string }
const savedConversations = ref<SavedConversation[]>([])
const savingConversation = ref(false)
const viewingConversation = ref<SavedConversation | null>(null)

async function loadSavedConversations() { try { const resp = await $fetch<{ success: boolean; data: SavedConversation[] }>('/api/conversations', { credentials: 'include' }); if (resp?.data) savedConversations.value = resp.data } catch {} }

async function saveCurrentConversation() {
  if (!selectedCaseId.value || !selectedMessages.value.length) return
  savingConversation.value = true
  try {
    const resp = await $fetch<{ success: boolean; data: { id: string; title: string } }>(`/api/cases/${selectedCaseId.value}/conversations`, { method: 'POST', credentials: 'include', body: { messages: selectedMessages.value } })
    if (resp?.data) { await loadSavedConversations(); alert(`已保存对话：${resp.data.title}`) }
  } catch (e: any) { alert('保存失败：' + (e?.message || '未知错误')) }
  finally { savingConversation.value = false }
}

async function openSavedConversation(id: string) { try { const resp = await $fetch<{ success: boolean; data: SavedConversation }>(`/api/conversations/${id}`, { credentials: 'include' }); if (resp?.data) viewingConversation.value = resp.data } catch {} }

// ============================================================
// KB Search / Upload
// ============================================================
const kbSearching = ref(false)
const kbResults = ref<Array<{ path: string; content: string; score: number }>>([])
const kbStats = ref('7569 条记录')
const kbList = ref<Array<{ path: string; rel_path: string; chunks: number }>>([])
const kbTree = ref<Array<any>>([])
const kbListLoading = ref(false)
const kbUploading = ref(false)
const kbUploadMsg = ref('')
const kbUploadOk = ref(false)

async function searchKB(query: string, mode = 'hybrid') {
  rightMode.value = 'kb-search'; kbSearching.value = true; kbResults.value = []
  try {
    const resp = await $fetch<{ results: Array<{ path: string; content: string; score: number }> }>('/api/kb/search', { method: 'POST', body: { query, top_k: 5, mode } })
    if (resp?.results) kbResults.value = resp.results
  } catch (e: any) { if ((e?.response?.status || e?.status) === 503) kbResults.value = [{ path: '知识库不可用', content: 'Python 依赖未安装。请运行：pip install -r requirements.txt', score: 0 }] }
  kbSearching.value = false
}

async function loadKbList() {
  kbListLoading.value = true; kbList.value = []; kbTree.value = []
  try {
    const resp = await $fetch<{ documents: Array<{ path: string; rel_path: string; chunks: number }>, tree: Array<any> }>('/api/kb/list', { params: { limit: 200 } })
    if (resp?.documents) kbList.value = resp.documents
    if (resp?.tree) kbTree.value = resp.tree
  } catch (e: any) {
    if ((e?.response?.status || e?.status) === 503) kbList.value = [{ path: '知识库依赖未安装', rel_path: '请运行 pip install -r requirements.txt', chunks: 0 }]
  }
  kbListLoading.value = false
}

async function uploadKbFile(file: File) {
  kbUploading.value = true; kbUploadMsg.value = ''
  const fd = new FormData(); fd.append('file', file)
  try {
    const resp = await $fetch<{ success: boolean; path: string }>('/api/kb/upload', { method: 'POST', body: fd })
    if (resp?.success) { kbUploadMsg.value = `上传成功：${file.name}`; kbUploadOk.value = true }
  } catch (e: any) { kbUploadMsg.value = (e?.response?.status || e?.status) === 503 ? '知识库依赖未安装。请运行：pip install -r requirements.txt' : `上传失败：${e?.message || '未知错误'}`; kbUploadOk.value = false }
  kbUploading.value = false
}

// ============================================================
// Utilities
// ============================================================
function formatDateTime(iso: string) { try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }) } catch { return iso } }

function renderMarkdown(md: string): string {
  if (!md) return ''
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = md.split('\n'); const out: string[] = []; let inTable = false; let tableRows: string[][] = []
  function flushTable() {
    if (!tableRows.length) return; const head = tableRows[0]; const body = tableRows.slice(2)
    out.push('<table class="w-full text-xs border-collapse my-2">')
    out.push('<thead><tr>' + head.map(c => `<th class="border border-gray-300 dark:border-gray-700 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-left">${ri(c)}</th>`).join('') + '</tr></thead>')
    if (body.length) out.push('<tbody>' + body.map(r => '<tr>' + r.map(c => `<td class="border border-gray-300 dark:border-gray-700 px-2 py-1 align-top">${ri(c)}</td>`).join('') + '</tr>').join('') + '</tbody>')
    out.push('</table>'); tableRows = []; inTable = false
  }
  function ri(s: string) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }
  for (const raw of lines) {
    const line = raw
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) { tableRows.push(line.trim().slice(1, -1).split('|').map(c => c.trim())); inTable = true; continue }
    if (inTable) flushTable()
    if (/^###\s+/.test(line)) out.push(`<h4 class="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">${ri(line.replace(/^###\s+/, ''))}</h4>`)
    else if (/^##\s+/.test(line)) out.push(`<h3 class="text-base font-semibold text-gray-900 dark:text-white mt-4 mb-2 pb-1 border-b border-gray-200 dark:border-gray-800">${ri(line.replace(/^##\s+/, ''))}</h3>`)
    else if (/^#\s+/.test(line)) out.push(`<h2 class="text-lg font-bold text-gray-900 dark:text-white mt-4 mb-2">${ri(line.replace(/^#\s+/, ''))}</h2>`)
    else if (/^---+$/.test(line.trim())) out.push('<hr class="my-3 border-gray-200 dark:border-gray-800" />')
    else if (/^[一二三四五六七八九十]+、/.test(line.trim())) out.push(`<h3 class="text-base font-semibold text-violet-700 dark:text-violet-300 mt-4 mb-2">${ri(line.trim())}</h3>`)
    else if (/^[-*]\s+/.test(line.trim())) out.push(`<div class="flex gap-1.5 ml-2 my-0.5 text-sm text-gray-700 dark:text-gray-300"><span class="text-violet-400 shrink-0">•</span><span>${ri(line.trim().replace(/^[-*]\s+/, ''))}</span></div>`)
    else if (/^\d+\.\s+/.test(line.trim())) out.push(`<div class="flex gap-1.5 ml-2 my-0.5 text-sm text-gray-700 dark:text-gray-300"><span class="text-violet-500 font-mono shrink-0">${line.trim().match(/^\d+/)![0]}.</span><span>${ri(line.trim().replace(/^\d+\.\s+/, ''))}</span></div>`)
    else if (line.trim() === '') out.push('<div class="h-1.5"></div>')
    else out.push(`<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed my-1">${ri(line)}</p>`)
  }
  if (inTable) flushTable()
  return out.join('')
}

// ============================================================
// Cleanup — fix: add stopPolling to onUnmounted
// ============================================================
onUnmounted(() => {
  stopPolling()
  chat.disconnect()
})
</script>
