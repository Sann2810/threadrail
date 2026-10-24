(() => {
  const conversation = document.querySelector('#conversation');
  const scroller = document.querySelector('#scroller');
  const prompts = [
    'Help me plan a 2-week study schedule for design and coding.',
    'What are some effective focus techniques?',
    'Give me a checklist for my design portfolio.',
    'What laptop would be good for design and development?',
    'Help me prepare for a product design interview.',
    'How do I give and receive useful design feedback?',
    'Can you suggest a small project to combine everything I learned?',
    'How should I reflect on my progress at the end of each week?',
  ];
  const responses = [
    '<p>Here’s a structured 2-week study schedule that balances design and coding, with focused goals each day.</p><h2>Week 1: Build Foundations</h2><div class="schedule"><div class="day"><span>▦</span><div><strong>Day 1</strong><p>Set up your environment and define goals</p></div></div><div class="day"><span>▤</span><div><strong>Day 2</strong><p>HTML & CSS fundamentals</p></div></div><div class="day"><span>◉</span><div><strong>Day 3</strong><p>Design principles: visual hierarchy, color, typography</p></div></div><div class="day"><span>⌘</span><div><strong>Day 4</strong><p>Build a small web page</p></div></div></div><p>Keep a short learning journal. What felt natural? What needs more practice? Use your answers to shape the following week.</p><h2>Week 2: Put it into practice</h2><p>Choose one small problem, sketch a solution, and build a working version. Finish with a short case study that explains your decisions.</p>',
    '<p>The best focus technique is one you can repeat. Start with a clear task, a small timebox, and a workspace with fewer distractions.</p><h2>Make the first step easy</h2><p>Try a 25-minute work session followed by a 5-minute break. Before starting, write down one specific outcome: “build the navigation” works better than “work on my project.”</p><h2>Protect your attention</h2><p>Put your phone away, close unrelated tabs, and keep a scratchpad for thoughts that can wait. After three sessions, take a longer break and step away from the screen.</p><p>Review your energy at the end of the day. Schedule difficult work for the hours when you feel most alert.</p>',
    '<p>Your portfolio should make it easy to understand how you think, what you contributed, and why your decisions mattered.</p><h2>A checklist for each case study</h2><p>Start with the problem and the people experiencing it. Explain your role, show the constraints, and describe the options you considered.</p><p>Include a few meaningful sketches, research insights, and iterations. Finish with the outcome and an honest reflection on what you would change.</p><p>Check every link, read the page on your phone, and make sure someone can understand the project in under two minutes.</p>',
    '<p>Start with the tools you actually use. For most design and front-end development work, memory, a comfortable display, and a good keyboard matter more than maximum processing power.</p><h2>A practical starting point</h2><p>Compare machines with enough memory for a design tool, browser, and development environment at the same time. Leave room for your projects and assets.</p><p>If you travel often, prioritize battery life and weight. If you mostly work at a desk, budget for a comfortable external display.</p><p>List your budget and essential apps before choosing. Check their current system requirements and compatibility.</p>',
    '<p>Prepare three stories you can tell clearly: a project you are proud of, a difficult tradeoff, and a time you changed your mind.</p><h2>Structure your stories</h2><p>Explain the context, the problem, what you did, and what happened. Make your contribution clear while giving your teammates credit.</p><p>Practice walking through a case study in ten minutes. Leave time for questions and be ready to explain why an alternative did not work.</p><p>Ask about the team’s design process, how decisions are made, and what success in the role would look like.</p>',
    '<p>Useful feedback connects an observation to a goal. Try “I had trouble finding the next step” and explain what you expected to happen.</p><h2>Keep the conversation specific</h2><p>When asking for feedback, share the stage of the work and the decision you need help with. A rough flow needs different feedback from a final visual pass.</p><p>Listen for the underlying problem before defending the design. Ask a follow-up question, take notes, and look for patterns across reviewers.</p>',
    '<p>Build a small personal reading list. It gives you enough scope to practice interaction design and front-end development without becoming a huge project.</p><h2>Keep version one small</h2><p>Let someone add a book, mark it as finished, and filter the list. Sketch the empty state, the populated list, and the add-book flow before writing code.</p><p>Choose two type sizes, a simple spacing scale, and one accent color. Make it work with a keyboard and on a narrow screen.</p><p>Share the prototype with one person and watch them use it. Fix the biggest point of confusion before adding more features.</p>',
    '<p>Set aside fifteen quiet minutes each week. Reflection works best when it is specific and kind.</p><h2>Three questions to ask yourself</h2><p>What can I do now that I could not do last week? What slowed me down? What one small thing will I try next?</p><p>Save one screenshot or small piece of work that shows progress. Over time, these make a useful record of how your thinking changed.</p><p>You do not need to make every week more ambitious. A sustainable rhythm matters more than a perfect schedule.</p>',
  ];

  function addExchange(question, answer, { complete = true, id } = {}) {
    const index = id ?? conversation.querySelectorAll('.user').length;
    const user = document.createElement('article');
    user.className = 'user'; user.dataset.testid = `conversation-turn-${index * 2}`;
    const input = document.createElement('div');
    input.dataset.messageAuthorRole = 'user'; input.dataset.messageId = `user-${index}`;
    input.textContent = question; user.append(input);
    const assistant = document.createElement('article');
    assistant.className = 'assistant'; assistant.dataset.testid = `conversation-turn-${index * 2 + 1}`;
    const output = document.createElement('div');
    output.dataset.messageAuthorRole = 'assistant'; output.dataset.messageId = `assistant-${index}`;
    output.innerHTML = answer; assistant.append(output);
    if (complete) {
      const actions = document.createElement('div'); actions.className = 'actions';
      actions.innerHTML = '<button data-testid="copy-turn-action-button" aria-label="Copy response">⧉</button><button aria-label="Good response">♧</button>';
      assistant.append(actions);
    } else { output.dataset.isStreaming = 'true'; output.classList.add('streaming'); }
    conversation.append(user, assistant);
    return { user, assistant, output };
  }

  function load(scenario = 'normal') {
    conversation.replaceChildren();
    document.querySelector('[data-testid="stop-button"]')?.remove();
    const count = scenario === 'single' ? 1 : scenario === 'dense' ? 200 : 8;
    for (let index = 0; index < count; index++) {
      let answer = responses[index % responses.length];
      if (index === count - 1 && scenario === 'long') answer = '<h2>A detailed guide to deliberate practice</h2>' + Array.from({ length: 38 }, (_, i) => `<p>Step ${i + 1}. Choose one useful skill to practice, set a clear goal, and make something small. Reflect on what changed, get feedback, and use what you learned in your next session.</p>`).join('');
      addExchange(scenario === 'dense' ? `Question ${index + 1}: ${prompts[index % prompts.length]}` : prompts[index % prompts.length], answer, { complete: !(scenario === 'streaming' && index === count - 1) });
    }
    if (scenario === 'streaming') {
      const stop = document.createElement('button'); stop.dataset.testid = 'stop-button';
      stop.textContent = 'Finish demo response'; stop.style.cssText = 'font-size:10px;width:auto;';
      stop.onclick = () => { const output = conversation.lastElementChild.querySelector('[data-message-author-role]'); delete output.dataset.isStreaming; output.classList.remove('streaming'); conversation.lastElementChild.dataset.messageStatus = 'complete'; stop.remove(); };
      document.querySelector('.compose-box').append(stop);
    }
    requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
  }

  document.querySelector('#scenario').onchange = event => load(event.target.value);
  document.querySelector('#explore').onclick = () => { scroller.scrollTop = conversation.querySelectorAll('.user')[1]?.offsetTop ?? 0; };
  document.querySelector('#reset').onclick = () => load(document.querySelector('#scenario').value);
  document.querySelector('#composer').onsubmit = event => {
    event.preventDefault(); const input = document.querySelector('input');
    if (!input.value.trim()) return;
    addExchange(input.value.trim(), '<p>This is a local demo reply. Your new question is now another completed exchange. Scroll up to find it on the rail.</p>');
    input.value = ''; requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
  };
  window.fixture = { load, addExchange, prompts };
  load();
})();
