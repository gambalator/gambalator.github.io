from flask import Flask, jsonify, render_template, request
from flask_sock import Sock
import os

# ********** ИМПОРТЫ ДЛЯ ИНТЕГРАЦИИ С GAMBALATOR: НАЧАЛО **********
from flask import redirect
import json
import logging
from urllib.error import URLError
from urllib.request import Request as UrlRequest, urlopen
# ********** ИМПОРТЫ ДЛЯ ИНТЕГРАЦИИ С GAMBALATOR: КОНЕЦ ************

from time import sleep
import random
from pynput import keyboard
import threading


path=os.getcwd()+'/static/image/'
token=''
startint=0
endint=0
amount=0
socketTest=1
rand=''
oldRand=''
key=''
kostilChatBot=0
config_file="config.txt"
prev_id=""
Key_clear_config=keyboard.Key.f20
Key_clear_end_value=keyboard.Key.f21
Key_step=keyboard.Key.f22




app = Flask(__name__)
sock=Sock(app)

def updateConfig():
    file = open(config_file,'w')
    file.write(f'startValue={startint}\n')
    file.write(f'endValue={endint}\n')
    file.write(f'step={step}\n')
    file.close()

def updateParamConfig():
    global startint
    global endint
    global step
    file = open(config_file)
    with file:
        f=file.read()
        startint=int(f.split('\n')[0].split('=')[1])
        endint=int(f.split('\n')[1].split('=')[1])
        step=int(f.split('\n')[2].split('=')[1])


def changeSocketStatus(key0,rand2):
    global rand
    global key
    global oldRand
    key=key0
    rand=rand2
    
    if key!='tts':
        while rand==oldRand:
            rand=random.randrange(0,1000)
    return ''


@app.route("/")
def hello():
    return "Hello World!"


@app.route('/donationGoalRGG')
def donationRGG():
    updateParamConfig()
    #if (startint//middleValue)>imgcount:
    if startint>=endint:
        png_number=imgcount-1
    else:
        print(f"{startint}//{middleValue}= {startint//middleValue}")
        png_number=startint//middleValue
    if(png_number>=imgcount-1):png_number=imgcount-1
    return render_template('donationGoalRGG.html',img=f"static/image/{png_number}.png",all=f"{startint}\\{endint}",token=token)#bAQlwdi38FKgaYYxeArN



@app.route('/getDataRGG')
def getDataRGG():
    global startint
    global endint
    global middleValue
    global prev_id
    updateParamConfig()
    alert_type = request.args.get('alert_type')
    amount = request.args.get('amount')
    _id = request.args.get('id')
    print(f'amount={amount}')

    if alert_type=='1' and not _id==prev_id:
        #newstartint=startint+int(amount)
        prev_id=_id
        startint=startint+int(float(amount))

        updateConfig()
        print(f"startint {startint}")
        print(f"imgcount {imgcount}")

    if startint>=endint:
        png_number=imgcount-1
    else:
        png_number=startint//middleValue
    print(f"png_number1 {png_number}")
    if(png_number>=imgcount-1):png_number=imgcount-1
    print(f"png_number2 {png_number}")
    return f"static/image/{png_number}.png:"+str(startint)+"\\"+str(endint)


@app.route('/s2')
def socket3():
    key = request.args.get('key')
    rand = request.args.get('rand')
    changeSocketStatus(key,rand)
    return 'hello world'
    

            
@app.after_request
def add_header(r):

    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    r.headers['Cache-Control'] = 'public, max-age=0'
    return r


try:
    file = open('token.txt')
except IOError as e:
    print(u'Файл токена не обнаружен')
    token=input('Введите токен: ')
    file = open('token.txt','w')
    file.write(token)
    file.close()
    print(token)
else:
    with file:
        token=file.read()
        #print(token)

def on_release(key):
    global startint
    global endint
    global middleValue
    #print(f'Отпущена клавиша: {key}')
    if key == Key_clear_config:  # 
    #if key == keyboard.Key.home: 
        startint=0
        endint=step
        updateConfig()
        updateParamConfig()
        print ("Clear config")
    elif key == Key_clear_end_value: 
    #elif key == keyboard.Key.end: 
        endint=step
        middleValue=endint//imgcount
        updateConfig()
        updateParamConfig()
        print ("Clear end")
    elif key == Key_step: 
    #elif key == keyboard.Key.alt_gr: 
        if startint>=endint:
            startint=startint-endint
            endint=endint+step
            middleValue=endint//imgcount
            updateConfig()
            updateParamConfig()
            print ("+ step")

def start_key_listener():
    with keyboard.Listener(on_release=on_release) as listener:
        listener.join()


try:
    file = open(config_file)
except IOError as e:
    print(u'Файл конфигурации не обнаружен')
    startint=int(input('Введите начальное значение: '))
    endint=int(input('Введите конечное значение: '))
    step=int(input('Введите шаг: '))
    updateConfig()
else:
    updateParamConfig()

imgcount=len([lists for lists in os.listdir(path)])
middleValue=endint//imgcount


# ********** ИНТЕГРАЦИЯ С GAMBALATOR: НАЧАЛО **********
GAMBALATOR_PORT=os.environ.get('GAMBALATOR_PORT','5741')
GAMBALATOR_URL=f'http://127.0.0.1:{GAMBALATOR_PORT}'
GAMBALATOR_OVERLAY_URL=f'{GAMBALATOR_URL}/api/overlay/state'
GAMBALATOR_ACTIONS_URL=f'{GAMBALATOR_URL}/api/calculator/actions'
Key_gambalator_calculate_one=keyboard.Key.f6
Key_gambalator_calculate_all=keyboard.Key.f7


# Перенаправляет короткий адрес /gamba на основную страницу Gambalator.
@app.route('/gamba')
def gambalator():
    return redirect('http://127.0.0.1:5741/')


# Открывает OBS-виджет с суммой и картинкой из Gambalator.
@app.route('/donationObsOverlay')
def donationObsOverlay():
    goal=getGambalatorGoal()
    # Временные 0/1 позволяют открыть страницу, даже если Gambalator ещё запускается.
    current,target=(0,10) if goal is None else goal
    png_number=goalImage(current,target)
    return render_template(
        'donationGoalGambalator.html',
        img=f"static/image/{png_number}.png",
        all=f"{formatTenths(current)}/{formatTenths(target)}",
    )


# Возвращает OBS-виджету новые значения без перезагрузки всей страницы.
@app.route('/getDataGambalator')
def getDataGambalator():
    goal=getGambalatorGoal()
    if goal is None:
        # Код 503 сообщает JavaScript, что нужно сохранить последнее верное состояние.
        return jsonify({'error':'Gambalator is unavailable'}),503
    current,target=goal
    png_number=goalImage(current,target)
    return jsonify({
        'image':f"static/image/{png_number}.png",
        'current':formatTenths(current),
        'target':formatTenths(target),
    })


# Скрывает только успешные служебные опросы OBS, но оставляет ошибки и остальные запросы.
def shouldLogGambalatorRequest(record):
    if not isinstance(record.args, tuple) or len(record.args) < 2:
        return True
    request_line,status=record.args[:2]
    return not (
        str(request_line).startswith('GET /getDataGambalator ')
        and str(status) == '200'
    )


logging.getLogger('werkzeug').addFilter(shouldLogGambalatorRequest)


# Читает из Gambalator текущую сумму и цель в десятых долях рубля.
def getGambalatorGoal():
    try:
        with urlopen(GAMBALATOR_OVERLAY_URL, timeout=1) as response:
            data=json.load(response)
        current=int(data['currentRubTenths'])
        target=int(data['targetRubTenths'])
        # Отбрасываем неправильный ответ, чтобы он не сломал расчёт картинки.
        if current < 0 or target <= 0:
            raise ValueError('invalid overlay values')
        return current,target
    except (OSError, URLError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


# Выбирает номер PNG по проценту выполнения цели.
def goalImage(current,target):
    if current >= target:
        return imgcount-1
    return min((current*imgcount)//target,imgcount-1)


# Преобразует 50000 десятых в текст 5000, а 50001 — в 5000.1.
def formatTenths(value):
    whole,remainder=divmod(value,10)
    return str(whole) if remainder == 0 else f'{whole}.{remainder}'


# Отправляет Gambalator запрос на расчёт с указанным ограничением раундов.
def requestGambalatorCalculation(max_rounds):
    payload=json.dumps({
        'type':'calculation/run',
        'maxRounds':max_rounds,
    }).encode('utf-8')
    api_request=UrlRequest(
        GAMBALATOR_ACTIONS_URL,
        data=payload,
        headers={
            'Accept':'application/json',
            'Content-Type':'application/json',
        },
        method='POST',
    )
    try:
        with urlopen(api_request,timeout=2) as response:
            result=json.load(response)
        return result.get('calculation',{}).get('completedRounds',0)
    except (OSError,URLError,ValueError,TypeError,json.JSONDecodeError):
        return None


# Запускает в Gambalator расчёт ровно одного полного раунда.
def calculateOneGambalatorRound():
    return requestGambalatorCalculation(1)


# Запускает расчёт всех полных раундов, для которых уже хватает донатов.
def calculateAllGambalatorRounds():
    # None превращается в JSON null: это означает отсутствие ограничения по раундам.
    return requestGambalatorCalculation(None)


# Запускает нужный вариант расчёта при отпускании F6 или F7.
def on_release_gambalator(key):
    if key == Key_gambalator_calculate_one:
        completed=calculateOneGambalatorRound()
        action='одного раунда'
    elif key == Key_gambalator_calculate_all:
        completed=calculateAllGambalatorRounds()
        action='всех раундов'
    else:
        return

    if completed is None:
        print(f'Не удалось запустить расчёт {action} в Gambalator')
    else:
        print(f'Gambalator завершил раундов: {completed}')


# Слушает F6 и F7 глобально, даже когда страница Gambalator закрыта.
def start_gambalator_key_listener():
    with keyboard.Listener(on_release=on_release_gambalator) as listener:
        listener.join()
# ********** ИНТЕГРАЦИЯ С GAMBALATOR: КОНЕЦ ************


if __name__ == "__main__":
    listener_thread = threading.Thread(target=start_key_listener)
    listener_thread.start()

    # ********** ЗАПУСК ГОРЯЧЕЙ КЛАВИШИ GAMBALATOR: НАЧАЛО **********
    gambalator_listener_thread = threading.Thread(target=start_gambalator_key_listener)
    gambalator_listener_thread.start()
    # ********** ЗАПУСК ГОРЯЧЕЙ КЛАВИШИ GAMBALATOR: КОНЕЦ ************

    app.config["CACHE_TYPE"] = "null"
    app.run(host='localhost', port=5000)#,debug=True)
