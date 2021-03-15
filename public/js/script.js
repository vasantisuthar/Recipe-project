let manage = (password) => {
    const submit = document.querySelector('.btSubmit');
         if(password.value != ''){
            submit.disabled = false;
        }else{
            submit.disabled = true;
        }
}

