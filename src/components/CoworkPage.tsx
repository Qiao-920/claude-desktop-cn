import { ArrowRight, Sparkles, UsersRound, Wrench } from 'lucide-react';
import { getStoredUiLanguage } from '../utils/chineseClientText';

const CoworkPage = () => {
  const isZh = getStoredUiLanguage() === 'zh-CN';

  if (!isZh) {
    return (
      <div className="h-full bg-claude-bg text-claude-text overflow-y-auto">
        <div className="mx-auto max-w-[980px] px-8 py-14">
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-claude-border text-claude-textSecondary">
              <UsersRound size={26} />
            </div>
            <div>
              <h1 className="text-[28px] font-semibold">Cowork workspace</h1>
              <p className="mt-1 text-[14px] text-claude-textSecondary">
                This tab is currently a staged skeleton for shared tasks, review flows, and multi-person collaboration.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-claude-border bg-claude-input p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-claude-hover text-claude-textSecondary">
                <Wrench size={18} />
              </div>
              <div className="text-[15px] font-semibold text-claude-text">Current status</div>
              <p className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
                The entry exists, but it is not wired to an execution engine yet.
              </p>
            </div>
            <div className="rounded-2xl border border-claude-border bg-claude-input p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-claude-hover text-claude-textSecondary">
                <Sparkles size={18} />
              </div>
              <div className="text-[15px] font-semibold text-claude-text">Use Code right now</div>
              <p className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
                If you want file access, Git, and command execution, switch to the Code tab and choose a workspace.
              </p>
            </div>
            <div className="rounded-2xl border border-claude-border bg-claude-input p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-claude-hover text-claude-textSecondary">
                <ArrowRight size={18} />
              </div>
              <div className="text-[15px] font-semibold text-claude-text">Next layer</div>
              <p className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
                The next implementation layer will add shared queues, review assignments, and project state views.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-claude-bg text-claude-text overflow-y-auto">
      <div className="mx-auto max-w-[980px] px-8 py-14">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-claude-border text-claude-textSecondary">
            <UsersRound size={26} />
          </div>
          <div>
            <h1 className="text-[28px] font-semibold">协作工作区</h1>
            <p className="mt-1 text-[14px] text-claude-textSecondary">
              这一页现在还是“已接入口、未接执行层”的状态。也就是说，页签已经预留好了，但还不是像聊天页那样能直接执行任务的成品页。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-claude-border bg-claude-input p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-claude-hover text-claude-textSecondary">
              <Wrench size={18} />
            </div>
            <div className="text-[15px] font-semibold text-claude-text">当前状态</div>
            <p className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
              这里现在主要是原生布局对标位，还没有接入真正的任务编排、指令执行或多人协作后端。
            </p>
          </div>

          <div className="rounded-2xl border border-claude-border bg-claude-input p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-claude-hover text-claude-textSecondary">
              <Sparkles size={18} />
            </div>
            <div className="text-[15px] font-semibold text-claude-text">现在该去哪里用</div>
            <p className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
              如果你想像 VS Code 那样选目录、看文件、跑命令、看 Git 状态，请切到上面的“代码”页签。那一页才是当前真正可用的工作区。
            </p>
          </div>

          <div className="rounded-2xl border border-claude-border bg-claude-input p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-claude-hover text-claude-textSecondary">
              <ArrowRight size={18} />
            </div>
            <div className="text-[15px] font-semibold text-claude-text">下一层准备补什么</div>
            <p className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
              适合继续补共享任务列表、审阅流、多人分工、项目状态看板，以及把聊天 / 代码里的动作汇总到这里。
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-claude-border bg-claude-input p-6">
          <div className="text-[16px] font-semibold text-claude-text">怎么理解这两个页签的区别</div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-claude-border bg-claude-bg p-4">
              <div className="text-[14px] font-medium text-claude-text">协作</div>
              <div className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
                更像“任务中枢 / 审阅中枢”的位置。未来适合放多人任务、共享流程、任务指派和审批记录。
              </div>
            </div>
            <div className="rounded-xl border border-claude-border bg-claude-bg p-4">
              <div className="text-[14px] font-medium text-claude-text">代码</div>
              <div className="mt-2 text-[13px] leading-6 text-claude-textSecondary">
                已经是可工作的本地工作区。你需要先选一个文件夹，再决定是安全模式、项目权限还是完全访问，然后在右边控制台输入真实命令。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoworkPage;
